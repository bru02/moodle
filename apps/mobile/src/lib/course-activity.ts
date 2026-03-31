import AsyncStorage from "@react-native-async-storage/async-storage";

import { bumpSpotlightCourseLastUsed } from "./spotlight";

export type CourseEngagementSource =
  | "course-detail"
  | "course-module"
  | "direct-module-launch";

const COURSE_ENGAGEMENT_KEY_PREFIX = "moodle.mobile.course-engagement";

function buildCourseEngagementKey(accountId: string, scopeId: string) {
  return `${COURSE_ENGAGEMENT_KEY_PREFIX}.${accountId}.${scopeId}`;
}

export async function readCourseEngagement(input: {
  accountId: string;
  scopeId: string;
}) {
  const raw = await AsyncStorage.getItem(
    buildCourseEngagementKey(input.accountId, input.scopeId),
  );
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function recordCourseEngagement(input: {
  accountId: string;
  scopeId: string;
  source: CourseEngagementSource;
  at?: number;
}) {
  void input.source;
  const at = input.at ?? Date.now();

  await Promise.all([
    AsyncStorage.setItem(
      buildCourseEngagementKey(input.accountId, input.scopeId),
      String(at),
    ),
    bumpSpotlightCourseLastUsed(input.scopeId, at),
  ]);
}
