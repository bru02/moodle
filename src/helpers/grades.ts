// @ts-expect-error no types
import domino from "@mixmark-io/domino";
import { stripHTML } from ".";
import type { CoreGradesGetUserGradesTableWSResponse, CoreGradesTableRow } from "../types/grade";
import { preferences } from "./preferences";

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

  const result = new Map<number, string>();

  for (const courseData of data) {
    for (const row of courseData.tables?.[0]?.tabledata ?? []) {
      const moduleId = getModuleIdFromGradeRow(row);
      if (!moduleId || result.has(moduleId)) continue;

      const gradeText = getGradeAccessoryText(row);
      if (gradeText) {
        result.set(moduleId, gradeText);
      }
    }
  }

  gradeAccessoryTextByModuleIdCache.set(data, result);
  return result;
}

function getModuleIdFromGradeRow(row: CoreGradesTableRow): number | undefined {
  const gradeHeader = domino.createDocument(row.itemname?.content || "").querySelector(".gradeitemheader");
  const linkedActivity = gradeHeader?.getAttribute("href");
  if (!linkedActivity) return undefined;

  try {
    const url = new URL(linkedActivity, preferences.site_url);
    const moduleId = Number(url.searchParams.get("id"));
    if (!Number.isFinite(moduleId)) return undefined;
    return moduleId;
  } catch {
    return undefined;
  }
}

function getGradeAccessoryText(row: CoreGradesTableRow): string | undefined {
  const grade =
    stripHTML(row.grade?.content || "")
      .split("\n")
      .shift()
      ?.trim() ?? "";
  const range = stripHTML(row.range?.content || "");

  let text = stripHTML(row.percentage?.content || "");

  if (!isPlaceholder(grade) && range) {
    const hi = range.split("–")[1]?.trim() ?? "∞";
    text = `${grade.replace(".00", "")} / ${hi}`;
  }

  if (isPlaceholder(text)) return undefined;
  return text;
}

function isPlaceholder(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === "-" || trimmed === "–" || trimmed === "—";
}
