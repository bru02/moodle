import { buildGradeAccessoryTextByModuleIdFromTables } from "@moodle/core";

import type { CoreGradesGetUserGradesTableWSResponse } from "../types/grade";
import { siteOrigin } from "./preferences";

const gradeAccessoryTextByModuleIdCache = new WeakMap<
  readonly CoreGradesGetUserGradesTableWSResponse[],
  Map<number, string>
>();

export function buildGradeAccessoryTextByModuleId(
  data: readonly CoreGradesGetUserGradesTableWSResponse[] | undefined,
): Map<number, string> {
  if (!data) {
    return new Map<number, string>();
  }

  const cached = gradeAccessoryTextByModuleIdCache.get(data);
  if (cached) {
    return cached;
  }

  const result = buildGradeAccessoryTextByModuleIdFromTables(data, {
    siteUrl: siteOrigin,
  });

  gradeAccessoryTextByModuleIdCache.set(data, result);
  return result;
}
