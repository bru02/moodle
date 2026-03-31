import { ExtensionStorage } from "@bacons/apple-targets";
import { Link } from "expo-router";

import type { SpotlightCourseRecord } from "./mobile-types";

const APP_GROUP = "group.moodle.mobile";
const SPOTLIGHT_COURSES_KEY = "spotlight-current-courses";

function getExtensionStorage() {
  if (process.env.EXPO_OS !== "ios") {
    return null;
  }

  try {
    return new ExtensionStorage(APP_GROUP);
  } catch {
    return null;
  }
}

export async function writeSpotlightCourses(records: readonly SpotlightCourseRecord[]) {
  const storage = getExtensionStorage();
  if (!storage) return;

  storage.set(
    SPOTLIGHT_COURSES_KEY,
    records.map((record) => ({
      id: record.id,
      courseId: record.courseId,
      title: record.title,
      subtitle: record.subtitle,
      deeplink: record.deeplink,
      keywords: record.keywords ?? "",
      updatedAt: record.updatedAt ?? 0,
      lastUsedAt: record.lastUsedAt ?? 0,
    })),
  );
}

export async function writeSpotlightSnapshot(input: {
  activeAccountId: string;
  generatedAt: number;
  courses: {
    id: string;
    title: string;
    courseCode?: string;
    semester?: string;
    seminarGroup?: string;
    courseIds?: number[];
    route: string;
    updatedAt?: number;
    lastUsedAt?: number;
  }[];
}) {
  const storage = getExtensionStorage();
  if (!storage) return;

  storage.set("spotlight-snapshot-meta", {
    activeAccountId: input.activeAccountId,
    generatedAt: input.generatedAt,
  });
  storage.set(
    SPOTLIGHT_COURSES_KEY,
    input.courses.map((course) => ({
      id: `${input.activeAccountId}:${course.id}`,
      courseId: course.id,
      title: course.title,
      subtitle: buildSubtitle(course),
      deeplink: toAppDeeplink(course.route),
      keywords: buildKeywords(course) || "",
      updatedAt: course.updatedAt ?? 0,
      lastUsedAt: course.lastUsedAt ?? 0,
    })),
  );
}

export async function bumpSpotlightCourseLastUsed(courseId: string, lastUsedAt = Date.now()) {
  const storage = getExtensionStorage();
  if (!storage) return;

  const records = readStoredSpotlightCourses(storage);
  if (records.length === 0) return;

  let changed = false;
  const nextRecords = records.map((record) => {
    if (record.courseId !== courseId) {
      return record;
    }

    changed = true;
    return {
      ...record,
      lastUsedAt: Math.max(record.lastUsedAt ?? 0, lastUsedAt),
    };
  });

  if (changed) {
    storage.set(SPOTLIGHT_COURSES_KEY, nextRecords);
  }
}

function readStoredSpotlightCourses(storage: ExtensionStorage): SpotlightCourseRecord[] {
  const storedValue = storage.get(SPOTLIGHT_COURSES_KEY);
  if (!Array.isArray(storedValue)) {
    return [];
  }

  return storedValue.filter(isSpotlightCourseRecord);
}

function isSpotlightCourseRecord(value: unknown): value is SpotlightCourseRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<SpotlightCourseRecord>;
  return typeof record.id === "string" && typeof record.courseId === "string" && typeof record.title === "string";
}

export function buildCourseDeeplink(scopeId: string) {
  return toAppDeeplink(
    Link.resolveHref({
      pathname: "/courses/[courseId]",
      params: { courseId: scopeId },
    }),
  );
}

function toAppDeeplink(route: string) {
  const resolvedRoute = route.startsWith("/") ? route.slice(1) : route;
  return `mobile://${resolvedRoute}`;
}

function buildSubtitle(course: {
  courseCode?: string;
  semester?: string;
  seminarGroup?: string;
}) {
  return [course.courseCode, course.seminarGroup, course.semester].filter(Boolean).join(" · ");
}

function buildKeywords(course: {
  courseCode?: string;
  semester?: string;
  seminarGroup?: string;
  courseIds?: number[];
}) {
  return [...new Set([
    course.courseCode?.trim(),
    course.semester?.trim(),
    course.seminarGroup?.trim(),
    ...(course.courseIds?.map((courseId) => String(courseId)) ?? []),
  ].filter((value): value is string => Boolean(value)))].join("\n");
}

export { APP_GROUP, SPOTLIGHT_COURSES_KEY };
