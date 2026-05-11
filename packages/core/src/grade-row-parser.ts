// @ts-expect-error no types
import domino from "@mixmark-io/domino";
import { decode } from "html-entities";

import { cleanGradeField, normalizeGradeText } from "./grade-text";
import type { CoreGradesTableRow } from "./grade-types";

type GradeRowKind = "category" | "item";

export type ParsedGradeRow = {
  label: string;
  level: number;
  kind: GradeRowKind;
  grade?: string;
  range?: string;
  percentage?: string;
  moduleId?: number;
};

export function parseGradeRows(
  rows: readonly CoreGradesTableRow[] | undefined,
  options: { siteUrl: string },
): ParsedGradeRow[] {
  if (!rows) return [];

  return rows
    .map((row) => parseGradeRow(row, options))
    .filter((row): row is ParsedGradeRow => Boolean(row && row.label));
}

export function parseGradeRow(
  row: CoreGradesTableRow,
  options: { siteUrl: string },
): ParsedGradeRow | undefined {
  if (!row.itemname?.content) return undefined;

  const itemClass = row.itemname.class || "";
  const kind: GradeRowKind = /\bcategory\b/.test(itemClass)
    ? "category"
    : "item";
  const label = extractGradeRowLabel(row.itemname.content, kind);
  if (!label) return undefined;

  return {
    label,
    level: parseLevel(itemClass),
    kind,
    grade: cleanGradeField(row.grade?.content),
    range: cleanGradeField(row.range?.content),
    percentage: cleanGradeField(row.percentage?.content),
    moduleId: extractModuleId(row.itemname.content, options.siteUrl),
  };
}

export function extractGradeRowLabel(
  itemNameHtml: string,
  kind?: GradeRowKind,
) {
  const doc = domino.createDocument(itemNameHtml);

  if (kind === "category") {
    const direct = doc.querySelector(
      ".category-content > span:last-child",
    )?.textContent;
    const text = normalizeGradeRowText(direct);
    if (text) return text;
  }

  const headerText = doc.querySelector(".gradeitemheader")?.textContent;
  const header = normalizeGradeRowText(headerText);
  if (header) return header;

  return normalizeGradeRowText(doc.body?.textContent || "");
}

export function extractModuleId(itemNameHtml: string, siteUrl: string) {
  const doc = domino.createDocument(itemNameHtml);
  const href = doc.querySelector(".gradeitemheader, a")?.getAttribute("href");
  if (!href) return undefined;

  try {
    const url = new URL(href, siteUrl);
    const moduleId = Number(url.searchParams.get("id"));
    return Number.isFinite(moduleId) ? moduleId : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeGradeRowText(value: string | null | undefined) {
  const html = value || "";
  return decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeGradeAccessoryValue(value: string | undefined) {
  return normalizeGradeText(value).split("\n").shift()?.trim() ?? "";
}

function parseLevel(itemClass: string) {
  const match = itemClass.match(/\blevel(\d+)\b/);
  return match ? Number(match[1]) : 1;
}
