import { createReadStream, createWriteStream } from "fs";
import { mkdir, readdir, rename, stat, unlink, utimes } from "fs/promises";
import { dirname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { resourceLimits as workerResourceLimits } from "worker_threads";

import { useEffect, useRef } from "react";

import { useUser } from "./client";
import { canConvert, checkFileSize, convertToPdf, handleFileUrl, pdfify } from "./helpers/files";
import { preferences } from "./helpers/preferences";
import { useFileSyncExceptionsStore, useFileSyncProgressStore } from "./store";
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

export function useSync(files: readonly (readonly [string, CoreWSExternalFile])[]) {
  const setDownloadProgress = useFileSyncProgressStore((state) => state.setDownloadProgress);
  const setConvertProgress = useFileSyncProgressStore((state) => state.setConvertProgress);
  const exceptions = useFileSyncExceptionsStore((state) => state.exceptions);
  const dirIndexRef = useRef(new Map<string, DirIndexEntry>());

  const { accessKey } = useUser();

  useEffect(() => {
    if (!preferences.sync_folder) return;

    const ctrl = new AbortController();

    let cancelled = false;

    const idleHandle = scheduleIdle(() => {
      if (cancelled) return;
      (async () => {
        const dirs = Array.from(new Set(files.map(([path]) => dirname(path))));
        throwIfAborted(ctrl.signal);
        await ensureDirIndex(dirs, dirIndexRef.current, ctrl);
        throwIfAborted(ctrl.signal);

        const syncQueue = files.filter(([path, file]) => !shouldSkipSync(path, file, exceptions));

        await runSyncQueue(syncQueue, {
          ctrl,
          setDownloadProgress,
          setConvertProgress,
          dirIndex: dirIndexRef.current,
        });
      })().catch((err) => {
        if (!isAbortError(err) && !ctrl.signal.aborted) {
          console.error("sync: background task aborted", err);
        }
      });
    });

    return () => {
      cancelled = true;
      cancelIdle(idleHandle);
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
  dirIndex: Map<string, DirIndexEntry>;
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

const DIR_INDEX_TTL_MS = 20_000;

type FileStatLite = {
  mtimeMs: number;
  size: number;
};

type DirIndexEntry = {
  builtAt: number;
  entries: Map<string, FileStatLite>;
};

type IdleHandle =
  | {
      mode: "ric";
      id: number;
    }
  | {
      mode: "timeout";
      id: ReturnType<typeof setTimeout>;
    };

function scheduleIdle(cb: () => void, timeoutMs = 250): IdleHandle {
  const idleApi = globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };

  if (typeof idleApi.requestIdleCallback === "function") {
    return { mode: "ric", id: idleApi.requestIdleCallback(cb, { timeout: timeoutMs }) };
  }

  return { mode: "timeout", id: setTimeout(cb, 50) };
}

function cancelIdle(handle: IdleHandle) {
  const idleApi = globalThis as typeof globalThis & {
    cancelIdleCallback?: (id: number) => void;
  };

  if (handle.mode === "ric" && typeof idleApi.cancelIdleCallback === "function") {
    idleApi.cancelIdleCallback(handle.id);
    return;
  }

  clearTimeout(handle.id);
}

function isDirIndexFresh(entry: DirIndexEntry) {
  return Date.now() - entry.builtAt <= DIR_INDEX_TTL_MS;
}

function isAbortError(err: unknown) {
  return err instanceof Error && err.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal) {
  signal.throwIfAborted();
}

function getIndexedStat(index: Map<string, DirIndexEntry>, target: string) {
  const dir = dirname(target);
  const entry = index.get(dir);
  if (!entry || !isDirIndexFresh(entry)) return null;
  return entry.entries.get(target) ?? null;
}

async function ensureDirIndex(dirs: string[], index: Map<string, DirIndexEntry>, ctrl: AbortController) {
  for (const dir of dirs) {
    throwIfAborted(ctrl.signal);
    const existing = index.get(dir);
    if (existing && isDirIndexFresh(existing)) continue;
    const entries = await scanDir(dir, ctrl);
    index.set(dir, { entries, builtAt: Date.now() });
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
    const fullPath = join(dir, dirent.name);
    try {
      const st = await stat(fullPath);
      entries.set(fullPath, { mtimeMs: st.mtimeMs, size: st.size });
    } catch {
      // ignore files that disappear between readdir/stat
    }
    if (++seen % 100 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return entries;
}

function shouldSkipSync(path: string, file: CoreWSExternalFile, exceptions: readonly string[]) {
  const filesize = file.filesize ?? 0;

  if (checkFileSize(filesize) && !exceptions.includes(path)) return true;
  return false;
}

function getHeapLimitMb() {
  const limit = workerResourceLimits.maxOldGenerationSizeMb;
  if (typeof limit === "number" && limit > 0) return limit;
  return DEFAULT_HEAP_LIMIT_MB;
}

function toMb(bytes: number) {
  return bytes / MB;
}

function resolveConcurrencyTarget(current: number, heapUsedMb: number, heapLimitMb: number) {
  const highDown = heapLimitMb * HIGH_WATER_DOWN_RATIO;
  const highUp = heapLimitMb * HIGH_WATER_UP_RATIO;
  const criticalDown = heapLimitMb * CRITICAL_DOWN_RATIO;
  const criticalUp = heapLimitMb * CRITICAL_UP_RATIO;

  const nextCurrent = Math.min(MAX_SYNC_CONCURRENCY, Math.max(MIN_SYNC_CONCURRENCY, current));

  if (nextCurrent === MAX_SYNC_CONCURRENCY) {
    if (heapUsedMb >= criticalDown) {
      return { target: MIN_SYNC_CONCURRENCY, reason: "critical-down" as const };
    }
    if (heapUsedMb >= highDown) {
      return { target: MID_SYNC_CONCURRENCY, reason: "high-down" as const };
    }
    return { target: MAX_SYNC_CONCURRENCY, reason: "steady" as const };
  }

  if (nextCurrent === MID_SYNC_CONCURRENCY) {
    if (heapUsedMb >= criticalDown) {
      return { target: MIN_SYNC_CONCURRENCY, reason: "critical-down" as const };
    }
    if (heapUsedMb <= highUp) {
      return { target: MAX_SYNC_CONCURRENCY, reason: "high-up" as const };
    }
    return { target: MID_SYNC_CONCURRENCY, reason: "steady" as const };
  }

  if (heapUsedMb <= criticalUp) {
    return { target: MID_SYNC_CONCURRENCY, reason: "critical-up" as const };
  }

  return { target: MIN_SYNC_CONCURRENCY, reason: "steady" as const };
}

async function runSyncQueue(
  queue: readonly (readonly [string, CoreWSExternalFile])[],
  { ctrl, setDownloadProgress, setConvertProgress, dirIndex }: Omit<SyncFileArgs, "path" | "file">,
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
    const task = (async () => {
      try {
        await syncFile({
          ctrl,
          path,
          file,
          setDownloadProgress,
          setConvertProgress,
          dirIndex,
        });
      } catch (err) {
        if (!ctrl.signal.aborted) {
          console.error("sync: failed while processing file", { path, error: err });
        }
      }
    })();

    inFlight.add(task);
    void task.finally(() => {
      inFlight.delete(task);
    });
  };

  while (!ctrl.signal.aborted && (index < queue.length || inFlight.size > 0)) {
    throwIfAborted(ctrl.signal);
    const now = Date.now();
    const mem = process.memoryUsage();
    const heapUsedMb = toMb(mem.heapUsed);
    const decision = resolveConcurrencyTarget(targetConcurrency, heapUsedMb, heapLimitMb);

    if (decision.target !== targetConcurrency) {
      targetConcurrency = decision.target;
      lastMemoryLogAt = now;
    } else if (now - lastMemoryLogAt >= MEMORY_LOG_INTERVAL_MS) {
      lastMemoryLogAt = now;
    }

    while (!ctrl.signal.aborted && index < queue.length && inFlight.size < targetConcurrency) {
      launch();
    }

    if (inFlight.size === 0) break;
    await Promise.race(inFlight);
  }

  await Promise.allSettled([...inFlight]);
}

async function syncFile({ ctrl, path, file, setDownloadProgress, setConvertProgress, dirIndex }: SyncFileArgs) {
  throwIfAborted(ctrl.signal);
  const { fileurl, mimetype } = file;
  const filesize = file.filesize ?? 0;
  const timemodified = file.timemodified ?? 0;
  const effectiveTimemodified = timemodified || Math.floor(Date.now() / 1000);
  const url = handleFileUrl(fileurl);
  const fileId = path;
  const convertible = Boolean(mimetype && canConvert(mimetype));
  const pdfPath = convertible ? pdfify(path) : "";

  const needsFile = await shouldDownload(path, effectiveTimemodified, dirIndex);
  const needsPdf = convertible ? await shouldGeneratePdf(pdfPath, effectiveTimemodified, dirIndex) : false;
  throwIfAborted(ctrl.signal);

  setDownloadProgress(fileId, needsFile ? 0 : 100);
  if (convertible) {
    setConvertProgress(fileId, needsPdf ? 0 : 100);
  }

  if (!needsFile && !needsPdf) return;

  await mkdir(dirname(path), { recursive: true });
  throwIfAborted(ctrl.signal);

  const pdfContext: PdfContext | undefined =
    needsPdf && mimetype
      ? { fileId, mimetype, pdfPath, timemodified: effectiveTimemodified, setConvertProgress }
      : undefined;

  if (!needsFile && pdfContext) {
    await convertFromDisk(pdfContext, path, ctrl.signal);
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
      await convertFromDisk(pdfContext, path, ctrl.signal);
    }
    return;
  }

  const downloadOk = await downloadWithResume(downloadContext);

  if (!downloadOk) {
    setDownloadProgress(fileId, 0);
    return;
  }

  if (pdfContext) {
    await convertFromDisk(pdfContext, path, ctrl.signal);
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

async function downloadWithResume(ctx: DownloadContext, mode: "resume" | "retry" = "resume"): Promise<boolean> {
  const { ctrl, url, partPath, partSize, filesize, fileId, setDownloadProgress } = ctx;

  throwIfAborted(ctrl.signal);
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
    signal: ctrl.signal,
  });

  const label = mode === "resume" ? "RESUME" : "RETRY";
  return validateAndFinalize(ctx, label, mode === "resume");
}

async function convertFromDisk(pdf: PdfContext, sourcePath: string, signal: AbortSignal) {
  throwIfAborted(signal);
  await convertAndStorePdf(pdf, createReadStream(sourcePath), signal);
}

async function convertAndStorePdf(pdf: PdfContext, body: ReadableStream | NodeJS.ReadableStream, signal: AbortSignal) {
  throwIfAborted(signal);
  if (isDestroyableReadable(body)) {
    signal.addEventListener("abort", () => body.destroy(signal.reason), { once: true });
  }
  // @ts-expect-error we validated the mimetype via canConvert
  const response = await convertToPdf(pdf.mimetype, body, signal);
  if (!response.ok || !response.body) {
    console.error("sync: pdf conversion request failed", {
      status: response.status,
      statusText: response.statusText,
      fileId: pdf.fileId,
    });
    return false;
  }

  await streamToFile(response, pdf.pdfPath, (pct) => pdf.setConvertProgress(pdf.fileId, pct), undefined, { signal });
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
  return typeof body === "object" && body != null && "destroy" in body && typeof body.destroy === "function";
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
  opts?: { append?: boolean; downloadedOffset?: number; totalSize?: number; signal?: AbortSignal },
) {
  const downloadedOffset = opts?.downloadedOffset ?? 0;
  let downloadedSize = downloadedOffset;
  const nodeReadable = Readable.fromWeb(stream ?? response.body!);
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

  if (!abortSignal) {
    return pipeline(nodeReadable, writer);
  }

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

async function shouldDownload(target: string, timemodified: number, index?: Map<string, DirIndexEntry>) {
  if (!timemodified) return true;

  if (index) {
    const indexed = getIndexedStat(index, target);
    if (indexed) {
      const okMtime = Math.floor(indexed.mtimeMs / 1000) >= timemodified - 1;
      return !okMtime;
    }
    return true;
  }

  try {
    const st = await stat(target);
    // since we check it on download, might not need to validate size here
    const okMtime = Math.floor(st.mtimeMs / 1000) >= timemodified - 1;
    return !okMtime;
  } catch {
    return true;
  }
}

async function shouldGeneratePdf(target: string, timemodified: number, index?: Map<string, DirIndexEntry>) {
  if (!timemodified) return true;

  if (index) {
    const indexed = getIndexedStat(index, target);
    if (indexed) {
      const ok = Math.floor(indexed.mtimeMs / 1000) >= timemodified - 1 && indexed.size > 0;
      return !ok;
    }
    return true;
  }

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
