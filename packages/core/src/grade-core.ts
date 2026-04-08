import type { CoreGradesGetUserGradesTableWSResponse, CoreGradesTableRow } from "./grade-types";
import { isPlaceholderGradeValue, normalizeGradeText } from "./grade-text";
import { normalizeGradeAccessoryValue, parseGradeRows } from "./grade-row-parser";

type GradeCoreOptions = {
  siteUrl: string;
};

export type GradeRowSummary = {
  label: string;
  grade?: string;
  range?: string;
  percentage?: string;
  moduleId?: number;
};

export function buildGradeAccessoryTextByModuleIdFromTables(
  data: readonly CoreGradesGetUserGradesTableWSResponse[] | undefined,
  options: GradeCoreOptions,
): Map<number, string> {
  if (!data) {
    return new Map<number, string>();
  }

  const result = new Map<number, string>();

  for (const courseData of data) {
    for (const row of parseGradeRows(courseData.tables?.[0]?.tabledata, options)) {
      const moduleId = row.moduleId;
      if (!moduleId || result.has(moduleId)) continue;

      const gradeText = getGradeAccessoryText(row);
      if (gradeText) {
        result.set(moduleId, gradeText);
      }
    }
  }

  return result;
}

export function toGradeRowSummaries(
  rows: readonly CoreGradesTableRow[] | undefined,
  options: GradeCoreOptions,
): GradeRowSummary[] {
  if (!rows) return [];

  return parseGradeRows(rows, options).map((row) => ({
    label: row.label,
    grade: row.grade,
    range: row.range,
    percentage: row.percentage,
    moduleId: row.moduleId,
  }));
}

function getGradeAccessoryText(row: Pick<GradeRowSummary, "grade" | "range" | "percentage">): string | undefined {
  const grade = normalizeGradeAccessoryValue(row.grade);
  const range = normalizeGradeText(row.range);
  let text = normalizeGradeText(row.percentage);

  if (!isPlaceholderGradeValue(grade) && range) {
    const hi = range.split("–")[1]?.trim() ?? "∞";
    text = `${grade.replace(".00", "")} / ${hi}`;
  }

  if (isPlaceholderGradeValue(text)) return undefined;
  return text;
}
