import ExcelJS from "exceljs";
import { stat } from "fs/promises";
import path from "path";
import { ScopedRenderedSection } from "../course-content";
import { asciiFold, normalizeLabel } from "./text";
import { WorkbookFingerprintEntry, WorkbookParseResult, WorkbookScoreEntry } from "./types";
import { classifyGradeKind, getFileSortScore, getSyncedLocalPath, isWorkbookCandidate, parseNumber } from "./utils";

type WorkbookIdentity = {
  path: string;
  courseId: number;
};

type ParsedWorkbookRow = {
  rowIndex: number;
  values: unknown[];
  maxColumn: number;
};

type ParsedSheetSnapshot = {
  sheetName: string;
  headerRows: string[][];
  matchedRows: ParsedWorkbookRow[];
  columnMaxima: Map<number, number>;
};

const IDENTIFIER_HEADER_RE = /\b(neptun|student id|identifier|code|id)\b/i;
const TOTAL_HEADER_RE = /\b(total|sum|overall|final points|ossz|osszesen)\b/i;
const GRADE_HEADER_RE = /\b(grade|mark|jegy|erdem)\b/i;
const ROUND_TARGETS = [0.5, 1, 2, 3, 4, 5, 10, 15, 20, 24, 25, 30, 35, 40, 50, 60, 90, 100];

export async function parseWorkbookEntries(
  sections: readonly ScopedRenderedSection[],
  identifiers: readonly string[],
): Promise<WorkbookParseResult> {
  const workbookFiles = collectWorkbookFiles(sections);
  const entries: WorkbookScoreEntry[] = [];
  const fingerprintEntries: WorkbookFingerprintEntry[] = [];
  const matchedWorkbookRows: WorkbookParseResult["matchedWorkbookRows"] = [];

  for (const workbook of workbookFiles) {
    const stats = await safeStat(workbook.path);
    if (!stats) continue;

    fingerprintEntries.push({ path: workbook.path, mtimeMs: stats.mtimeMs, size: stats.size });

    try {
      const workbookRows = await parseWorkbook(workbook, identifiers);
      entries.push(...workbookRows.entries);
      matchedWorkbookRows.push(...workbookRows.rows);
    } catch (error) {
      console.error("workbook: failed to parse", workbook.path, error);
    }
  }

  return { entries, fingerprintEntries, matchedWorkbookRows };
}

export async function collectWorkbookFingerprints(sections: readonly ScopedRenderedSection[]) {
  const workbookFiles = collectWorkbookFiles(sections);
  const fingerprintEntries: WorkbookFingerprintEntry[] = [];

  for (const workbook of workbookFiles) {
    const stats = await safeStat(workbook.path);
    if (!stats) continue;
    fingerprintEntries.push({ path: workbook.path, mtimeMs: stats.mtimeMs, size: stats.size });
  }

  return fingerprintEntries;
}

async function safeStat(targetPath: string) {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

function collectWorkbookFiles(sections: readonly ScopedRenderedSection[]) {
  const seen = new Set<string>();
  const files: WorkbookIdentity[] = [];

  for (const section of sections) {
    for (const scopedModule of section.modules) {
      for (const content of scopedModule.module.contents ?? []) {
        if (!content.filename?.toLowerCase().endsWith(".xlsx")) continue;
        if (!isWorkbookCandidate(scopedModule.module, content)) continue;

        const localPath = getSyncedLocalPath(content, scopedModule.module, scopedModule.course);
        if (!localPath || seen.has(localPath)) continue;
        seen.add(localPath);
        files.push({ path: localPath, courseId: scopedModule.course.id });
      }
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function parseWorkbook(workbookIdentity: WorkbookIdentity, identifiers: readonly string[]) {
  const foldedIdentifiers = identifiers.map((value) => normalizeLabel(value)).filter(Boolean);
  if (foldedIdentifiers.length === 0) {
    return { entries: [], rows: [] };
  }

  const sheets = await collectSheetSnapshots(workbookIdentity.path, foldedIdentifiers);
  const entries: WorkbookScoreEntry[] = [];
  const rows: { path: string; sheetName: string; rowIndex: number }[] = [];

  for (const sheet of sheets) {
    for (const matchedRow of sheet.matchedRows) {
      const parsedEntries = parseWorkbookRow({
        courseId: workbookIdentity.courseId,
        workbookPath: workbookIdentity.path,
        sheet,
        row: matchedRow,
      });

      if (parsedEntries.length === 0) continue;
      rows.push({ path: workbookIdentity.path, sheetName: sheet.sheetName, rowIndex: matchedRow.rowIndex });
      entries.push(...parsedEntries);
    }
  }

  return { entries, rows };
}

async function collectSheetSnapshots(workbookPath: string, identifiers: readonly string[]) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(workbookPath, {
    worksheets: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
  });

  const sheets: ParsedSheetSnapshot[] = [];

  for await (const worksheet of workbook) {
    const headerRows: string[][] = [];
    const matchedRows: ParsedWorkbookRow[] = [];
    const columnMaxima = new Map<number, number>();

    for await (const row of worksheet) {
      const rowIndex = row.number;
      const values = normalizeRowValues(row.values);
      const maxColumn = getMaxColumn(values);

      if (rowIndex <= 5) {
        headerRows[rowIndex - 1] = readHeaderRow(values, maxColumn);
      }

      updateColumnMaxima(columnMaxima, values, maxColumn);

      if (rowMatchesIdentifiers(readIdentifierCells(values), identifiers)) {
        matchedRows.push({ rowIndex, values, maxColumn });
      }
    }

    if (matchedRows.length > 0) {
      const worksheetWithName = worksheet as unknown as { name?: string };
      const sheetName = worksheetWithName.name || `Sheet ${sheets.length + 1}`;

      sheets.push({
        sheetName,
        headerRows,
        matchedRows,
        columnMaxima,
      });
    }
  }

  return sheets;
}

function normalizeRowValues(rowValues: unknown) {
  if (Array.isArray(rowValues)) {
    return rowValues;
  }
  return [];
}

function getMaxColumn(values: unknown[]) {
  for (let index = values.length - 1; index >= 1; index--) {
    if (!isCellEmpty(values[index])) return index;
  }
  return 0;
}

function readHeaderRow(values: unknown[], maxColumn: number) {
  const cells: string[] = [];
  for (let colIndex = 1; colIndex <= maxColumn; colIndex++) {
    cells[colIndex - 1] = normalizeHeaderPart(getCellText(values[colIndex]));
  }
  return cells;
}

function updateColumnMaxima(columnMaxima: Map<number, number>, values: unknown[], maxColumn: number) {
  for (let colIndex = 1; colIndex <= maxColumn; colIndex++) {
    const numericValue = parseCellNumber(values[colIndex]);
    if (numericValue == null) continue;
    columnMaxima.set(colIndex, Math.max(columnMaxima.get(colIndex) ?? numericValue, numericValue));
  }
}

function readIdentifierCells(values: unknown[]) {
  const cells: string[] = [];
  for (let colIndex = 1; colIndex <= Math.min(getMaxColumn(values), 6); colIndex++) {
    cells.push(normalizeLabel(getCellText(values[colIndex])));
  }
  return cells;
}

function rowMatchesIdentifiers(values: readonly string[], identifiers: readonly string[]) {
  return identifiers.some((identifier) =>
    values.some((value) => {
      if (!value) return false;
      if (/^[a-z0-9]{6}$/i.test(identifier)) return value === identifier;
      return value.includes(identifier);
    }),
  );
}

function parseWorkbookRow({
  courseId,
  workbookPath,
  sheet,
  row,
}: {
  courseId: number;
  workbookPath: string;
  sheet: ParsedSheetSnapshot;
  row: ParsedWorkbookRow;
}) {
  const entries: WorkbookScoreEntry[] = [];

  for (let colIndex = 2; colIndex <= row.maxColumn; colIndex++) {
    const rawValue = parseCellNumber(row.values[colIndex]);
    if (rawValue == null) continue;

    const header = detectHeader(sheet.headerRows, colIndex);
    const normalizedHeader = normalizeLabel(header);
    if (!header || isIdentifierHeader(normalizedHeader) || isTotalOrGradeHeader(normalizedHeader)) continue;

    const inferredMax = inferColumnMax(sheet.columnMaxima.get(colIndex) ?? rawValue);
    if (inferredMax == null || inferredMax <= 0 || inferredMax > 150) continue;

    entries.push({
      id: `${courseId}:${path.basename(workbookPath)}:${sheet.sheetName}:${row.rowIndex}:${colIndex}`,
      courseId,
      label: header,
      normalizedLabel: normalizedHeader,
      kind: classifyGradeKind(header, "xlsx"),
      raw: rawValue,
      max: inferredMax,
      pct: inferredMax ? (rawValue / inferredMax) * 100 : null,
      posted: true,
      source: "xlsx",
      workbookPath,
      sheetName: sheet.sheetName,
      rowIndex: row.rowIndex,
      columnIndex: colIndex,
    });
  }

  return entries;
}

function detectHeader(headerRows: string[][], colIndex: number) {
  const parts: string[] = [];

  for (const headerRow of headerRows) {
    if (!headerRow) continue;
    const text = getHeaderValue(headerRow, colIndex);
    if (!text) continue;
    if (parts[parts.length - 1] !== text) {
      parts.push(text);
    }
  }

  return parts.join(" / ");
}

function getHeaderValue(headerRow: string[], colIndex: number) {
  const direct = headerRow[colIndex - 1];
  if (direct) return direct;

  for (let current = colIndex - 2; current >= 0; current--) {
    const value = headerRow[current];
    if (value) return value;
  }

  return "";
}

function normalizeHeaderPart(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getCellText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object" && value && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  return String(value);
}

function parseCellNumber(value: unknown) {
  if (typeof value === "number") return value;
  return parseNumber(getCellText(value));
}

function isCellEmpty(value: unknown) {
  return getCellText(value).trim().length === 0;
}

function inferColumnMax(observedMax: number) {
  for (const target of ROUND_TARGETS) {
    if (Math.abs(observedMax - target) <= Math.max(0.2, target * 0.08)) {
      return target;
    }
  }

  return observedMax <= 10 ? Math.round(observedMax * 2) / 2 : Math.round(observedMax);
}

export function isIdentifierHeader(value: string) {
  return !value || IDENTIFIER_HEADER_RE.test(asciiFold(value));
}

function isTotalOrGradeHeader(value: string) {
  return TOTAL_HEADER_RE.test(value) || GRADE_HEADER_RE.test(value);
}

export function rankWorkbookCandidateName(filename: string) {
  return getFileSortScore({ filename });
}
