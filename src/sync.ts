import { createReadStream, createWriteStream } from "fs";
import { mkdir, rename, stat, unlink, utimes } from "fs/promises";
import { dirname } from "path";
import { useEffect } from "react";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { useUser } from "./client";
import { preferences } from "./helpers";
import { canConvert, checkFileSize, convertToPdf, handleFileUrl, pdfify } from "./helpers/files";
import { useFileSyncStore } from "./store";
import type { CoreWSExternalFile } from "./types";

export function useSync(files: readonly (readonly [string, CoreWSExternalFile])[]) {
  const setDownloadProgress = useFileSyncStore((state) => state.setDownloadProgress);
  const setConvertProgress = useFileSyncStore((state) => state.setConvertProgress);
  const exceptions = useFileSyncStore((state) => state.exceptions);

  const { accessKey } = useUser();

  useEffect(() => {
    const ctrl = new AbortController();

    if (!preferences.sync_folder) return;

    (async () => {
      for (const [path, file] of files) {
        if (shouldSkipSync(path, file, exceptions)) continue;

        try {
          await syncFile({
            ctrl,
            path,
            file,
            setDownloadProgress,
            setConvertProgress,
          });
        } catch (err) {
          console.error("sync: failed while processing file", { path, error: err });
        }
      }
    })().catch((err) => {
      console.error("sync: background task aborted", err);
    });

    return () => {
      ctrl.abort();
    };
  }, [files, accessKey, exceptions, setConvertProgress, setDownloadProgress]);
}

type ProgressSetter = (fileId: string, pct: number) => void;

interface SyncFileArgs {
  ctrl: AbortController;
  path: string;
  file: CoreWSExternalFile;
  setDownloadProgress: ProgressSetter;
  setConvertProgress: ProgressSetter;
}

interface PdfContext {
  fileId: string;
  mimetype: string;
  pdfPath: string;
  timemodified: number;
  setConvertProgress: ProgressSetter;
}

interface DownloadContext {
  ctrl: AbortController;
  url: string;
  path: string;
  partPath: string;
  partSize: number;
  filesize: number;
  timemodified: number;
  fileId: string;
  setDownloadProgress: ProgressSetter;
}

type TeeContext = DownloadContext & { pdf: PdfContext };

function shouldSkipSync(path: string, file: CoreWSExternalFile, exceptions: readonly string[]) {
  const filesize = file.filesize ?? 0;

  if (checkFileSize(filesize) && !exceptions.includes(path)) return true;
  return false;
}

async function syncFile({ ctrl, path, file, setDownloadProgress, setConvertProgress }: SyncFileArgs) {
  const { fileurl, mimetype } = file;
  const filesize = file.filesize ?? 0;
  const timemodified = file.timemodified ?? 0;
  const effectiveTimemodified = timemodified || Math.floor(Date.now() / 1000);
  const url = handleFileUrl(fileurl);
  const fileId = path;
  const convertible = Boolean(mimetype && canConvert(mimetype));
  const pdfPath = convertible ? pdfify(path) : "";

  const needsFile = await shouldDownload(path, effectiveTimemodified);
  const needsPdf = convertible ? await shouldGeneratePdf(pdfPath, effectiveTimemodified) : false;

  setDownloadProgress(fileId, needsFile ? 0 : 100);
  if (convertible && !needsPdf) {
    setConvertProgress(fileId, 100);
  }

  if (!needsFile && !needsPdf) return;

  await mkdir(dirname(path), { recursive: true });

  const pdfContext: PdfContext | undefined =
    needsPdf && mimetype
      ? { fileId, mimetype, pdfPath, timemodified: effectiveTimemodified, setConvertProgress }
      : undefined;

  if (!needsFile && pdfContext) {
    await convertFromDisk(pdfContext, path);
    return;
  }

  const { partPath, partSize } = await preparePartFile(path, filesize);

  const downloadContext: DownloadContext = {
    ctrl,
    url,
    path,
    partPath,
    partSize,
    filesize,
    timemodified: effectiveTimemodified,
    fileId,
    setDownloadProgress,
  };

  if (await finalizeCompletePart(downloadContext)) {
    if (pdfContext) {
      await convertFromDisk(pdfContext, path);
    }
    return;
  }

  const preferTee = Boolean(pdfContext) && partSize === 0;
  const downloadOk =
    preferTee && pdfContext
      ? await downloadWithTee({ ...downloadContext, pdf: pdfContext })
      : await downloadWithResume(downloadContext);

  if (!downloadOk) {
    setDownloadProgress(fileId, 0);
    return;
  }

  if (pdfContext && !preferTee) {
    await convertFromDisk(pdfContext, path);
  }
}

async function preparePartFile(path: string, filesize: number) {
  const partPath = `${path}.part`;
  const partSize = await getFileSize(partPath);

  if (filesize > 0 && partSize > filesize) {
    await safeUnlink(partPath);
    return { partPath, partSize: 0 };
  }

  return { partPath, partSize };
}

async function downloadWithTee(ctx: TeeContext) {
  const { ctrl, url, partPath, filesize, fileId, pdf, setDownloadProgress } = ctx;

  const response = await fetch(url, { signal: ctrl.signal });
  if (!response.ok || !response.body) {
    console.error("sync: download request failed", {
      fileId,
      url,
      status: response.status,
      statusText: response.statusText,
      stage: "initial tee fetch",
    });
    return false;
  }

  const [fileStream, pdfStream] = response.body.tee();

  const [downloadResult] = await Promise.allSettled([
    streamToFile(response, partPath, (pct) => setDownloadProgress(fileId, pct), fileStream, {
      append: false,
      downloadedOffset: 0,
      totalSize: filesize || undefined,
    }),
    convertAndStorePdf(pdf, pdfStream),
  ]);

  if (downloadResult.status === "rejected") {
    console.error("sync: download stream failed", {
      fileId,
      url,
      reason: downloadResult.reason,
    });
    return false;
  }

  return validateAndFinalize(ctx, "TEE DOWNLOAD");
}

async function downloadWithResume(ctx: DownloadContext, mode: "resume" | "retry" = "resume"): Promise<boolean> {
  const { ctrl, url, partPath, partSize, filesize, fileId, setDownloadProgress } = ctx;

  const wantsResume = mode === "resume" && partSize > 0;
  let append = wantsResume;
  let downloadedOffset = wantsResume ? partSize : 0;

  const rangeHeaders = wantsResume ? { Range: `bytes=${partSize}-` } : undefined;

  let response = await fetch(url, {
    signal: ctrl.signal,
    headers: rangeHeaders,
  });

  if (wantsResume && (response.status === 200 || response.status === 416)) {
    await safeUnlink(partPath);
    append = false;
    downloadedOffset = 0;
    response = await fetch(url, { signal: ctrl.signal });
  } else if (wantsResume && response.status === 206) {
    const contentRange = response.headers.get("Content-Range");
    const rangeStart = contentRange?.split(" ")[1]?.split("-")[0];
    if (!rangeStart || Number(rangeStart) !== partSize) {
      await safeUnlink(partPath);
      append = false;
      downloadedOffset = 0;
      response = await fetch(url, { signal: ctrl.signal });
    }
  }

  if (!response.ok || !response.body) {
    console.error("sync: download request failed", {
      fileId,
      url,
      status: response.status,
      statusText: response.statusText,
      stage: wantsResume ? "range fetch" : "full fetch",
    });
    return false;
  }

  await streamToFile(response, partPath, (pct) => setDownloadProgress(fileId, pct), undefined, {
    append,
    downloadedOffset,
    totalSize: filesize || undefined,
  });

  const label = mode === "resume" ? "RESUME" : "RETRY";
  return validateAndFinalize(ctx, label, mode === "resume");
}

async function convertFromDisk(pdf: PdfContext, sourcePath: string) {
  await convertAndStorePdf(pdf, createReadStream(sourcePath));
}

async function convertAndStorePdf(pdf: PdfContext, body: ReadableStream | NodeJS.ReadableStream) {
  // @ts-expect-error we validated the mimetype via canConvert
  const response = await convertToPdf(pdf.mimetype, body);
  if (!response.ok || !response.body) {
    console.error("sync: pdf conversion request failed", {
      status: response.status,
      statusText: response.statusText,
      fileId: pdf.fileId,
    });
    return false;
  }

  await streamToFile(response, pdf.pdfPath, (pct) => pdf.setConvertProgress(pdf.fileId, pct));
  const ok = await validatePositiveSize(pdf.pdfPath);
  if (!ok) {
    await safeUnlink(pdf.pdfPath);
    return false;
  }
  await utimes(pdf.pdfPath, Date.now() / 1000, pdf.timemodified);
  pdf.setConvertProgress(pdf.fileId, 100);
  return true;
}

async function finalizeDownload(ctx: DownloadContext) {
  await rename(ctx.partPath, ctx.path);
  await utimes(ctx.path, Date.now() / 1000, ctx.timemodified);
  ctx.setDownloadProgress(ctx.fileId, 100);
}

async function finalizeCompletePart(ctx: DownloadContext) {
  if (ctx.filesize > 0 && ctx.partSize === ctx.filesize) {
    await finalizeDownload(ctx);
    return true;
  }
  return false;
}

async function validateAndFinalize(ctx: DownloadContext, label: string, allowRetry = true): Promise<boolean> {
  if (ctx.filesize > 0) {
    const ok = await validateSizeEquals(ctx.partPath, ctx.filesize);
    if (!ok) {
      const meta = { path: ctx.path, expected: ctx.filesize, fileId: ctx.fileId };
      if (!allowRetry) {
        console.error("sync: integrity check failed after download", { ...meta, stage: label });
        await safeUnlink(ctx.partPath);
        return false;
      }
      console.warn("sync: size mismatch detected, retrying download", { ...meta, stage: label });
      await safeUnlink(ctx.partPath);
      return downloadWithResume({ ...ctx, partSize: 0 }, "retry");
    }
  }

  await finalizeDownload(ctx);
  return true;
}

async function streamToFile(
  response: Response,
  path: string,
  onProgress: (pct: number) => unknown,
  stream?: ReadableStream,
  opts?: { append?: boolean; downloadedOffset?: number; totalSize?: number },
) {
  const downloadedOffset = opts?.downloadedOffset ?? 0;
  let downloadedSize = downloadedOffset;
  const nodeReadable = Readable.fromWeb(stream ?? response.body!);
  const writer = createWriteStream(path, { flags: opts?.append ? "a" : "w" });

  const headerLength = Number(response.headers.get("Content-Length")) || 0;
  let totalSize = opts?.totalSize ?? 0;

  if (!totalSize) {
    const contentRange = response.headers.get("Content-Range");
    if (contentRange && /\d+-\d+\/\d+/.test(contentRange)) {
      const total = contentRange.split("/").pop();
      totalSize = total ? Number(total) : 0;
    } else if (headerLength && downloadedOffset) {
      totalSize = headerLength + downloadedOffset;
    } else {
      totalSize = headerLength;
    }
  }

  let lastProgress = 0;

  nodeReadable.on("data", (chunk) => {
    downloadedSize += chunk.length;
    const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
    if (totalSize > 0 && (progress - lastProgress >= 0.5 || progress === 100)) {
      lastProgress = progress;
      onProgress(progress);
    }
  });

  return pipeline(nodeReadable, writer);
}

async function shouldDownload(target: string, timemodified: number) {
  if (!timemodified) return true;

  try {
    const st = await stat(target);
    // since we check it on download, might not need to validate size here
    const okMtime = Math.floor(st.mtimeMs / 1000) >= timemodified - 1;

    return !okMtime;
  } catch {
    return true;
  }
}

async function shouldGeneratePdf(target: string, timemodified: number) {
  if (!timemodified) return true;

  try {
    const st = await stat(target);
    const ok = Math.floor(st.mtimeMs / 1000) >= timemodified - 1 && st.size > 0;
    return !ok;
  } catch {
    return true;
  }
}

async function safeUnlink(p: string) {
  await unlink(p).catch(() => {
    /* ignore */
  });
}

async function getFileSize(p: string) {
  try {
    const s = await stat(p);
    return s.size;
  } catch {
    return 0;
  }
}

async function validateSizeEquals(p: string, expected: number) {
  if (!expected || expected <= 0) return true;
  return (await getFileSize(p)) === expected;
}

async function validatePositiveSize(p: string) {
  return (await getFileSize(p)) > 0;
}
