import { appendFile, mkdir } from "fs/promises";
import { dirname, join } from "path";

import { environment } from "@raycast/api";

export type CourseAccessMethod = "view-course" | "view-grades" | "open-browser" | "open-folder" | "deeplink";

export type CourseAccessLogInput = {
  courseId: number;
  method: CourseAccessMethod;
  searchQuery?: string | null;
};

const ACCESS_LOG_PATH = join(environment.supportPath, "analytics", "course-access.ndjson");
const DEDUPE_WINDOW_MS = 400;
const recentlyLoggedEvents = new Map<string, number>();
let hasLoggedWriteFailure = false;

export async function logCourseAccess(input: CourseAccessLogInput) {
  const now = Date.now();
  const searchQuery = normalizeSearchQuery(input.searchQuery);
  const dedupeKey = `${input.method}|${input.courseId}|${searchQuery ?? ""}`;
  const previouslyLoggedAt = recentlyLoggedEvents.get(dedupeKey);
  const elapsedSincePreviousLog = now - (previouslyLoggedAt ?? Number.NEGATIVE_INFINITY);
  if (elapsedSincePreviousLog < DEDUPE_WINDOW_MS) {
    return;
  }
  recentlyLoggedEvents.set(dedupeKey, now);
  cleanupDedupeMap(now);

  const payload = JSON.stringify({
    accessedAt: now,
    courseId: input.courseId,
    method: input.method,
    searchQuery,
  });

  try {
    await mkdir(dirname(ACCESS_LOG_PATH), { recursive: true });
    await appendFile(ACCESS_LOG_PATH, `${payload}\n`, "utf8");
  } catch (error) {
    if (!hasLoggedWriteFailure) {
      hasLoggedWriteFailure = true;
      console.error("course-access-log: failed to append NDJSON log entry", error);
    }
  }
}

function normalizeSearchQuery(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanupDedupeMap(now: number) {
  for (const [key, timestamp] of recentlyLoggedEvents) {
    if (now - timestamp > DEDUPE_WINDOW_MS * 4) {
      recentlyLoggedEvents.delete(key);
    }
  }
}
