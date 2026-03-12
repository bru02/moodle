import { mkdir } from "fs/promises";
import { join, resolve } from "path";
import { getHeapStatistics, writeHeapSnapshot } from "v8";

const MB = 1024 * 1024;
const SNAPSHOT_DIR = process.env.MOODLE_HEAP_SNAPSHOT_DIR || resolve(process.cwd(), "tmp", "heapshots");
const SNAPSHOT_MAX = Math.max(1, Number(process.env.MOODLE_HEAP_SNAPSHOT_MAX || "3"));
const SNAPSHOT_COOLDOWN_MS = Math.max(0, Number(process.env.MOODLE_HEAP_SNAPSHOT_COOLDOWN_MS || "15000"));
const SNAPSHOT_THRESHOLD_MB = Number(process.env.MOODLE_HEAP_SNAPSHOT_MB || "0");

let lastSnapshotAt = 0;
let snapshotCount = 0;
let isWritingSnapshot = false;
const capturedKeys = new Set<string>();

export async function maybeWriteHeapSnapshot(
  reason: string,
  metadata?: Record<string, unknown>,
  options?: { force?: boolean; key?: string },
) {
  if (isWritingSnapshot || snapshotCount >= SNAPSHOT_MAX) {
    return;
  }

  const key = options?.key;
  if (key && capturedKeys.has(key)) {
    return;
  }

  const now = Date.now();
  if (!options?.force && now - lastSnapshotAt < SNAPSHOT_COOLDOWN_MS) {
    return;
  }

  const heapUsedMb = process.memoryUsage().heapUsed / MB;
  const heapLimitMb = getHeapStatistics().heap_size_limit / MB;
  const thresholdMb = SNAPSHOT_THRESHOLD_MB > 0 ? SNAPSHOT_THRESHOLD_MB : heapLimitMb * 0.7;

  if (!options?.force && heapUsedMb < thresholdMb) {
    return;
  }

  isWritingSnapshot = true;
  lastSnapshotAt = now;
  snapshotCount++;
  if (key) {
    capturedKeys.add(key);
  }

  try {
    await mkdir(SNAPSHOT_DIR, { recursive: true });
    const safeReason = reason.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "snapshot";
    const file = join(SNAPSHOT_DIR, `${now}-${safeReason}-${Math.round(heapUsedMb)}mb.heapsnapshot`);
    console.warn("heap-snapshot: capturing", {
      reason,
      file,
      heapUsedMb: Math.round(heapUsedMb),
      heapLimitMb: Math.round(heapLimitMb),
      ...metadata,
    });
    const writtenFile = writeHeapSnapshot(file);
    console.warn("heap-snapshot: wrote", { file: writtenFile });
  } catch (error) {
    console.error("heap-snapshot: failed", { reason, error });
  } finally {
    isWritingSnapshot = false;
  }
}
