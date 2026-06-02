import { randomUUID } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, readdir, rename, stat, unlink, utimes } from "fs/promises";
import { dirname } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { resourceLimits as workerResourceLimits } from "worker_threads";

import type { CoreWSExternalFile } from "./types";

const MB = 1024 * 1024;
const DEFAULT_HEAP_LIMIT_MB = 100;
const MAX_SYNC_CONCURRENCY = 2;
const MID_SYNC_CONCURRENCY = 1;
const MIN_SYNC_CONCURRENCY = 1;
const HIGH_WATER_DOWN_RATIO = 0.8;
const HIGH_WATER_UP_RATIO = 0.65;
const CRITICAL_DOWN_RATIO = 0.9;
const CRITICAL_UP_RATIO = 0.75;
const MEMORY_LOG_INTERVAL_MS = 5_000;
const DIR_INDEX_TTL_MS = 20_000;

type ProgressSetter = (fileId: string, pct: number) => void;

type FileStatLite = {
  mtimeMs: number;
  size: number;
};

type DirIndexEntry = {
  builtAt: number;
  entries: Map<string, FileStatLite>;
};

type SyncFileArgs = {
  ctrl: AbortController;
  path: string;
  file: CoreWSExternalFile;
  setDownloadProgress: ProgressSetter;
  setConvertProgress: ProgressSetter;
  dirIndex: Map<string, DirIndexEntry>;
  resolveFileUrl: (url: string) => string;
};

type PdfContext = {
  fileId: string;
  mimetype: keyof typeof conversionUrls;
  pdfPath: string;
  timemodified: number;
  setConvertProgress: ProgressSetter;
};

type DownloadContext = {
  ctrl: AbortController;
  url: string;
  path: string;
  partPath: string;
  partSize: number;
  filesize: number;
  timemodified: number;
  fileId: string;
  setDownloadProgress: ProgressSetter;
};

const ppt = () =>
  "https://pptcs.officeapps.live.com/document/export/pdf?input=pptx&keepPDFProtection=true";

const conversionUrls = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    () =>
      `https://wordcs.officeapps.live.com/wordauto/wordautomation.svc/rest/ConvertFileREST?${new URLSearchParams(
        {
          correlationId: `{${randomUUID().toUpperCase()}}`,
          inputFormat: "DOCX",
          outputFormat: "PDF",
          endpointName: "Mac",
          isFileUncompressed: "true",
        },
      )}`,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ppt,
  "application/vnd.ms-powerpoint": ppt,
};

export async function syncFilesToDisk(
  files: readonly (readonly [string, CoreWSExternalFile])[],
  options: {
    signal?: AbortSignal;
    resolveFileUrl: (url: string) => string;
    onDownloadProgress?: ProgressSetter;
    onConvertProgress?: ProgressSetter;
  },
) {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });

  try {
    const dirIndex = new Map<string, DirIndexEntry>();
    const dirs = Array.from(new Set(files.map(([path]) => dirname(path))));
    await ensureDirIndex(dirs, dirIndex, ctrl);
    await runSyncQueue(files, {
      ctrl,
      setDownloadProgress: options.onDownloadProgress ?? noopProgress,
      setConvertProgress: options.onConvertProgress ?? noopProgress,
      dirIndex,
      resolveFileUrl: options.resolveFileUrl,
    });
  } finally {
    options.signal?.removeEventListener("abort", abort);
  }
}

function getHeapLimitMb() {
  const limit = workerResourceLimits.maxOldGenerationSizeMb;
  if (typeof limit === "number" && limit > 0) return limit;
  return DEFAULT_HEAP_LIMIT_MB;
}

function toMb(bytes: number) {
  return bytes / MB;
}

function resolveConcurrencyTarget(
  current: number,
  heapUsedMb: number,
  heapLimitMb: number,
) {
  const highDown = heapLimitMb * HIGH_WATER_DOWN_RATIO;
  const highUp = heapLimitMb * HIGH_WATER_UP_RATIO;
  const criticalDown = heapLimitMb * CRITICAL_DOWN_RATIO;
  const criticalUp = heapLimitMb * CRITICAL_UP_RATIO;
  const nextCurrent = Math.min(
    MAX_SYNC_CONCURRENCY,
    Math.max(MIN_SYNC_CONCURRENCY, current),
  );

  if (nextCurrent === MAX_SYNC_CONCURRENCY) {
    if (heapUsedMb >= criticalDown) return MIN_SYNC_CONCURRENCY;
    if (heapUsedMb >= highDown) return MID_SYNC_CONCURRENCY;
    return MAX_SYNC_CONCURRENCY;
  }

  if (nextCurrent === MID_SYNC_CONCURRENCY) {
    if (heapUsedMb >= criticalDown) return MIN_SYNC_CONCURRENCY;
    if (heapUsedMb <= highUp) return MAX_SYNC_CONCURRENCY;
    return MID_SYNC_CONCURRENCY;
  }

  if (heapUsedMb <= criticalUp) return MID_SYNC_CONCURRENCY;
  return MIN_SYNC_CONCURRENCY;
}

async function runSyncQueue(
  queue: readonly (readonly [string, CoreWSExternalFile])[],
  args: Omit<SyncFileArgs, "path" | "file">,
) {
  const heapLimitMb = getHeapLimitMb();
  const inFlight = new Set<Promise<void>>();
  let index = 0;
  let targetConcurrency = MAX_SYNC_CONCURRENCY;
  let lastMemoryLogAt = 0;

  const launch = () => {
    const item = queue[index++];
    if (!item) return;
    const [path, file] = item;
    const task = syncFile({ ...args, path, file }).catch((error: unknown) => {
      if (!args.ctrl.signal.aborted) {
        console.error("sync: failed while processing file", { path, error });
      }
    });
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  };

  while (
    !args.ctrl.signal.aborted &&
    (index < queue.length || inFlight.size > 0)
  ) {
    throwIfAborted(args.ctrl.signal);
    const now = Date.now();
    const heapUsedMb = toMb(process.memoryUsage().heapUsed);
    targetConcurrency = resolveConcurrencyTarget(
      targetConcurrency,
      heapUsedMb,
      heapLimitMb,
    );
    if (now - lastMemoryLogAt >= MEMORY_LOG_INTERVAL_MS) {
      lastMemoryLogAt = now;
    }

    while (
      !args.ctrl.signal.aborted &&
      index < queue.length &&
      inFlight.size < targetConcurrency
    ) {
      launch();
    }

    if (inFlight.size === 0) break;
    await Promise.race(inFlight);
  }

  await Promise.allSettled([...inFlight]);
}

async function syncFile({
  ctrl,
  path,
  file,
  setDownloadProgress,
  setConvertProgress,
  dirIndex,
  resolveFileUrl,
}: SyncFileArgs) {
  throwIfAborted(ctrl.signal);
  const { fileurl, mimetype } = file;
  const filesize = file.filesize ?? 0;
  const timemodified = file.timemodified ?? 0;
  const effectiveTimemodified = timemodified || Math.floor(Date.now() / 1000);
  const url = resolveFileUrl(fileurl);
  const fileId = path;
  const convertibleMimetype = canConvert(mimetype) ? mimetype : undefined;
  const pdfPath = convertibleMimetype ? pdfify(path) : "";
  const needsFile = await shouldDownload(path, effectiveTimemodified, dirIndex);
  const needsPdf = convertibleMimetype
    ? await shouldGeneratePdf(pdfPath, effectiveTimemodified, dirIndex)
    : false;
  throwIfAborted(ctrl.signal);

  setDownloadProgress(fileId, needsFile ? 0 : 100);
  if (convertibleMimetype) setConvertProgress(fileId, needsPdf ? 0 : 100);
  if (!needsFile && !needsPdf) return;

  await mkdir(dirname(path), { recursive: true });
  throwIfAborted(ctrl.signal);

  const pdfContext =
    needsPdf && convertibleMimetype
      ? {
          fileId,
          mimetype: convertibleMimetype,
          pdfPath,
          timemodified: effectiveTimemodified,
          setConvertProgress,
        }
      : undefined;

  if (!needsFile && pdfContext) {
    await convertFromDisk(pdfContext, path, ctrl.signal);
    return;
  }

  const { partPath, partSize } = await preparePartFile(path, filesize);
  const downloadContext = {
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
    if (pdfContext) await convertFromDisk(pdfContext, path, ctrl.signal);
    return;
  }

  const downloadOk = await downloadWithResume(downloadContext);
  if (!downloadOk) {
    setDownloadProgress(fileId, 0);
    return;
  }
  if (pdfContext) await convertFromDisk(pdfContext, path, ctrl.signal);
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

async function downloadWithResume(
  ctx: DownloadContext,
  mode: "resume" | "retry" = "resume",
): Promise<boolean> {
  const {
    ctrl,
    url,
    partPath,
    partSize,
    filesize,
    fileId,
    setDownloadProgress,
  } = ctx;
  throwIfAborted(ctrl.signal);
  const wantsResume = mode === "resume" && partSize > 0;
  let append = wantsResume;
  let downloadedOffset = wantsResume ? partSize : 0;
  const rangeHeaders = wantsResume
    ? { Range: `bytes=${partSize}-` }
    : undefined;
  const signal = ctrl.signal as never;
  let response = await fetch(url, { signal, headers: rangeHeaders });

  if (wantsResume && (response.status === 200 || response.status === 416)) {
    await safeUnlink(partPath);
    append = false;
    downloadedOffset = 0;
    response = await fetch(url, { signal });
  } else if (wantsResume && response.status === 206) {
    const contentRange = response.headers.get("Content-Range");
    const rangeStart = contentRange?.split(" ")[1]?.split("-")[0];
    if (!rangeStart || Number(rangeStart) !== partSize) {
      await safeUnlink(partPath);
      append = false;
      downloadedOffset = 0;
      response = await fetch(url, { signal });
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

  await streamToFile(
    response,
    partPath,
    (pct) => setDownloadProgress(fileId, pct),
    {
      append,
      downloadedOffset,
      totalSize: filesize || undefined,
      signal: ctrl.signal,
    },
  );

  return validateAndFinalize(ctx, mode === "resume");
}

async function convertFromDisk(
  pdf: PdfContext,
  sourcePath: string,
  signal: AbortSignal,
) {
  throwIfAborted(signal);
  await convertAndStorePdf(pdf, createReadStream(sourcePath), signal);
}

async function convertAndStorePdf(
  pdf: PdfContext,
  body: ReadableStream | NodeJS.ReadableStream,
  signal: AbortSignal,
) {
  throwIfAborted(signal);
  if (isDestroyableReadable(body)) {
    signal.addEventListener("abort", () => body.destroy(signal.reason), {
      once: true,
    });
  }
  const response = await convertToPdf(pdf.mimetype, body, signal);
  if (!response.ok || !response.body) {
    console.error("sync: pdf conversion request failed", {
      status: response.status,
      statusText: response.statusText,
      fileId: pdf.fileId,
    });
    return false;
  }

  await streamToFile(response, pdf.pdfPath, (pct) =>
    pdf.setConvertProgress(pdf.fileId, pct),
  );
  const ok = await validatePositiveSize(pdf.pdfPath);
  if (!ok) {
    await safeUnlink(pdf.pdfPath);
    return false;
  }
  await utimes(pdf.pdfPath, Date.now() / 1000, pdf.timemodified);
  pdf.setConvertProgress(pdf.fileId, 100);
  return true;
}

function isDestroyableReadable(
  body: ReadableStream | NodeJS.ReadableStream,
): body is NodeJS.ReadableStream & { destroy(error?: unknown): void } {
  return (
    typeof body === "object" &&
    body != null &&
    "destroy" in body &&
    typeof body.destroy === "function"
  );
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

async function validateAndFinalize(
  ctx: DownloadContext,
  allowRetry = true,
): Promise<boolean> {
  if (ctx.filesize > 0) {
    const ok = await validateSizeEquals(ctx.partPath, ctx.filesize);
    if (!ok) {
      if (!allowRetry) {
        console.error("sync: integrity check failed after download", {
          path: ctx.path,
          expected: ctx.filesize,
          fileId: ctx.fileId,
        });
        await safeUnlink(ctx.partPath);
        return false;
      }
      console.warn("sync: size mismatch detected, retrying download", {
        path: ctx.path,
        expected: ctx.filesize,
        fileId: ctx.fileId,
      });
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
  opts?: {
    append?: boolean;
    downloadedOffset?: number;
    totalSize?: number;
    signal?: AbortSignal;
  },
) {
  const downloadedOffset = opts?.downloadedOffset ?? 0;
  let downloadedSize = downloadedOffset;
  const nodeReadable = Readable.fromWeb(response.body!);
  const writer = createWriteStream(path, { flags: opts?.append ? "a" : "w" });
  const abortSignal = opts?.signal;
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
  let lastProgressAt = 0;
  nodeReadable.on("data", (chunk) => {
    downloadedSize += chunk.length;
    if (totalSize <= 0) return;
    const progress = (downloadedSize / totalSize) * 100;
    const now = Date.now();
    const enoughDelta = progress - lastProgress >= 5;
    const enoughTime = now - lastProgressAt >= 400;
    if (progress >= 100 || enoughDelta || enoughTime) {
      lastProgress = progress;
      lastProgressAt = now;
      onProgress(progress);
    }
  });

  if (!abortSignal) return pipeline(nodeReadable, writer);
  if (abortSignal.aborted) {
    nodeReadable.destroy(abortSignal.reason);
    writer.destroy(abortSignal.reason);
    throw abortSignal.reason;
  }

  const onAbort = () => {
    nodeReadable.destroy(abortSignal.reason);
    writer.destroy(abortSignal.reason);
  };
  abortSignal.addEventListener("abort", onAbort, { once: true });
  try {
    return await pipeline(nodeReadable, writer);
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
  }
}

async function ensureDirIndex(
  dirs: string[],
  index: Map<string, DirIndexEntry>,
  ctrl: AbortController,
) {
  for (const dir of dirs) {
    throwIfAborted(ctrl.signal);
    const existing = index.get(dir);
    if (existing && isDirIndexFresh(existing)) continue;
    index.set(dir, { entries: await scanDir(dir, ctrl), builtAt: Date.now() });
  }
}

async function scanDir(dir: string, ctrl: AbortController) {
  const entries = new Map<string, FileStatLite>();
  let dirents: Awaited<ReturnType<typeof readdir>> = [];
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch {
    return entries;
  }

  let seen = 0;
  for (const dirent of dirents) {
    throwIfAborted(ctrl.signal);
    if (!dirent.isFile()) continue;
    const fullPath = `${dir}/${dirent.name}`;
    try {
      const st = await stat(fullPath);
      entries.set(fullPath, { mtimeMs: st.mtimeMs, size: st.size });
    } catch {
      /* ignore files that disappear between readdir/stat */
    }
    if (++seen % 100 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return entries;
}

function isDirIndexFresh(entry: DirIndexEntry) {
  return Date.now() - entry.builtAt <= DIR_INDEX_TTL_MS;
}

function getIndexedStat(index: Map<string, DirIndexEntry>, target: string) {
  const dir = dirname(target);
  const entry = index.get(dir);
  if (!entry || !isDirIndexFresh(entry)) return null;
  return entry.entries.get(target) ?? null;
}

async function shouldDownload(
  target: string,
  timemodified: number,
  index?: Map<string, DirIndexEntry>,
) {
  if (!timemodified) return true;
  const indexed = index ? getIndexedStat(index, target) : null;
  if (indexed) {
    return Math.floor(indexed.mtimeMs / 1000) < timemodified - 1;
  }
  try {
    const st = await stat(target);
    return Math.floor(st.mtimeMs / 1000) < timemodified - 1;
  } catch {
    return true;
  }
}

async function shouldGeneratePdf(
  target: string,
  timemodified: number,
  index?: Map<string, DirIndexEntry>,
) {
  if (!timemodified) return true;
  const indexed = index ? getIndexedStat(index, target) : null;
  if (indexed) {
    return (
      Math.floor(indexed.mtimeMs / 1000) < timemodified - 1 || indexed.size <= 0
    );
  }
  try {
    const st = await stat(target);
    return Math.floor(st.mtimeMs / 1000) < timemodified - 1 || st.size <= 0;
  } catch {
    return true;
  }
}

function pdfify(path: string) {
  return path.replace(/\.[^/.]+$/, ".pdf");
}

function canConvert(
  mimeType?: string,
): mimeType is keyof typeof conversionUrls {
  return Boolean(mimeType && mimeType in conversionUrls);
}

function convertToPdf(
  format: keyof typeof conversionUrls,
  body: ReadableStream | NodeJS.ReadableStream,
  signal?: AbortSignal,
) {
  return fetch(conversionUrls[format](), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(format !==
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ? { "X-ClientCorrelationId": `{${randomUUID().toUpperCase()}}` }
        : {}),
    },
    body: body as never,
    duplex: "half",
    signal: signal as never,
  } as RequestInit);
}

function throwIfAborted(signal: AbortSignal) {
  signal.throwIfAborted();
}

async function safeUnlink(p: string) {
  await unlink(p).catch(() => {
    /* ignore */
  });
}

async function getFileSize(p: string) {
  try {
    return (await stat(p)).size;
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

function noopProgress() {
  /* headless sync ignores progress by default */
}
