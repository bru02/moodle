import type { CoreGradesGetUserGradesTableWSResponse, CoreGradesTableRow } from "./grade-types";

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
    for (const row of courseData.tables?.[0]?.tabledata ?? []) {
      const moduleId = getModuleIdFromGradeRow(row, options);
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

  return rows
    .map((row) => {
      const label = stripHtml(row.itemname?.content || "")
        .replace(/\s+/g, " ")
        .trim();
      const grade = cleanField(row.grade?.content);
      const range = cleanField(row.range?.content);
      const percentage = cleanField(row.percentage?.content);
      const moduleId = getModuleIdFromGradeRow(row, options);
      return {
        label,
        grade,
        range,
        percentage,
        moduleId,
      } satisfies GradeRowSummary;
    })
    .filter((row) => row.label.length > 0);
}

function getModuleIdFromGradeRow(row: CoreGradesTableRow, options: GradeCoreOptions): number | undefined {
  const linkedActivity = extractHrefFromItemName(row.itemname?.content || "");
  if (!linkedActivity) return undefined;

  try {
    const url = new URL(linkedActivity, options.siteUrl);
    const moduleId = Number(url.searchParams.get("id"));
    if (!Number.isFinite(moduleId)) return undefined;
    return moduleId;
  } catch {
    return undefined;
  }
}

function getGradeAccessoryText(row: CoreGradesTableRow): string | undefined {
  const grade =
    stripHtml(row.grade?.content || "")
      .split("\n")
      .shift()
      ?.trim() ?? "";
  const range = stripHtml(row.range?.content || "");

  let text = stripHtml(row.percentage?.content || "");

  if (!isPlaceholder(grade) && range) {
    const hi = range.split("–")[1]?.trim() ?? "∞";
    text = `${grade.replace(".00", "")} / ${hi}`;
  }

  if (isPlaceholder(text)) return undefined;
  return text;
}

function extractHrefFromItemName(itemNameHtml: string): string | undefined {
  const hrefMatch = itemNameHtml.match(/href\s*=\s*["']([^"']+)["']/i);
  return hrefMatch?.[1];
}

function cleanField(value: string | undefined): string | undefined {
  const cleaned = stripHtml(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (isPlaceholder(cleaned)) return undefined;
  return cleaned;
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function isPlaceholder(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === "-" || trimmed === "–" || trimmed === "—";
}
