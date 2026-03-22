import { execFile } from "child_process";
import { readFile, stat } from "fs/promises";
import path from "path";

import type { ScopedRenderedSection, SimpleCourse } from "@moodle/core";
import ExcelJS from "exceljs";
import { sanitize } from "sanitize-filename-ts";

import { CoreWSExternalFile, Module } from "../types";
import { ensureAnalysisFileOnDisk, getAnalysisCourseFolder } from "./file-sync";
import { classifyGradeKind, parseNumber } from "./pure-utils";
import { asciiFold, normalizeLabel } from "./text";
import { WorkbookFingerprintEntry, WorkbookParseResult, WorkbookScoreEntry } from "./types";

type WorkbookIdentity = {
  courseId: number;
  moduleName: string;
  sectionName: string;
  contentFilename: string;
  contextLabels: string[];
  file: CoreWSExternalFile;
  module: Module;
  course: SimpleCourse;
};

type LocalWorkbookIdentity = WorkbookIdentity & {
  path: string;
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

type ParsedDocumentRow = {
  rowIndex: number;
  identifier: string;
  values: string[];
};

const IDENTIFIER_HEADER_RE = /\b(neptun(?:kod)?|student id|identifier|username|user name|code|id)\b/i;
const ADMIN_HEADER_RE = /\b(recommended grade|mean|st dev|std dev|min|max|median|quartile)\b/i;
const QUESTION_HEADER_RE = /^q\s*\d+\b/i;
const ROUND_TARGETS = [0.5, 1, 2, 3, 4, 5, 10, 15, 20, 24, 25, 30, 35, 40, 50, 60, 90, 100];
const TABULAR_DOC_EXTENSIONS = new Set([".xlsx", ".pdf", ".docx", ".doc", ".txt", ".csv", ".tsv"]);
const GRADE_WORD_TO_VALUE: Record<string, number> = {
  excellent: 5,
  jeles: 5,
  good: 4,
  jo: 4,
  satisfactory: 3,
  kozepes: 3,
  medium: 3,
  pass: 2,
  lowpass: 2,
  sufficient: 2,
  elegseges: 2,
  fail: 1,
  failed: 1,
  megbukott: 1,
};

let liteParseInstancePromise: Promise<{
  parse(filePath: string, quiet?: boolean): Promise<{ text: string }>;
}> | null = null;

export async function parseWorkbookEntries(
  sections: readonly ScopedRenderedSection[],
  identifiers: readonly string[],
  options?: {
    accessKey?: string;
    syncFolder?: string;
  },
): Promise<WorkbookParseResult> {
  const workbookFiles = collectWorkbookFiles(sections, options?.syncFolder);
  const entries: WorkbookScoreEntry[] = [];
  const fingerprintEntries: WorkbookFingerprintEntry[] = [];
  const matchedWorkbookRows: WorkbookParseResult["matchedWorkbookRows"] = [];

  for (const workbook of workbookFiles) {
    const localPath = await ensureAnalysisFileOnDisk({
      file: workbook.file,
      module: workbook.module,
      course: workbook.course,
      accessKey: options?.accessKey,
      syncFolder: options?.syncFolder,
    }).catch(() => null);

    const stats = localPath ? await safeStat(localPath) : null;

    fingerprintEntries.push({
      path: localPath ?? getWorkbookFallbackPath(workbook, options?.syncFolder),
      mtimeMs: stats?.mtimeMs ?? (workbook.file.timemodified ?? 0) * 1000,
      size: stats?.size ?? workbook.file.filesize ?? 0,
    });

    if (!stats || !localPath) continue;

    try {
      const workbookRows = await parseWorkbook({ ...workbook, path: localPath }, identifiers);
      entries.push(...workbookRows.entries);
      matchedWorkbookRows.push(...workbookRows.rows);
    } catch (error) {
      console.error("workbook: failed to parse", localPath, error);
    }
  }

  return { entries, fingerprintEntries, matchedWorkbookRows };
}

async function safeStat(targetPath: string) {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

function collectWorkbookFiles(sections: readonly ScopedRenderedSection[], syncFolder?: string) {
  const seen = new Set<string>();
  const files: WorkbookIdentity[] = [];

  for (const section of sections) {
    for (const scopedModule of section.modules) {
      const siblingLabels = [
        scopedModule.sectionName,
        scopedModule.module.name,
        ...((scopedModule.module.contents ?? []).map((content) => content.filename).filter(Boolean) as string[]),
      ];

      for (const content of scopedModule.module.contents ?? []) {
        const extension = path.extname(content.filename).toLowerCase();
        if (!TABULAR_DOC_EXTENSIONS.has(extension)) continue;
        if (!isWorkbookCandidate(scopedModule.module, content.filename)) continue;

        const localPath = getWorkbookLocalPath(content.filename, scopedModule.module, scopedModule.course, syncFolder);
        if (!localPath || seen.has(localPath)) continue;

        seen.add(localPath);
        files.push({
          courseId: scopedModule.course.id,
          moduleName: scopedModule.module.name,
          sectionName: scopedModule.sectionName,
          contentFilename: content.filename,
          contextLabels: dedupeStrings(siblingLabels),
          file: content,
          module: scopedModule.module,
          course: scopedModule.course,
        });
      }
    }
  }

  return files.sort((left, right) =>
    getWorkbookFallbackPath(left, syncFolder).localeCompare(getWorkbookFallbackPath(right, syncFolder)),
  );
}

async function parseWorkbook(workbookIdentity: LocalWorkbookIdentity, identifiers: readonly string[]) {
  const foldedIdentifiers = identifiers.map((value) => normalizeLabel(value)).filter(Boolean);
  if (foldedIdentifiers.length === 0) {
    return { entries: [], rows: [] };
  }

  const extension = path.extname(workbookIdentity.path).toLowerCase();
  if (extension !== ".xlsx") {
    return await parseTabularDocument(workbookIdentity, foldedIdentifiers);
  }

  const sheets = await collectSheetSnapshots(workbookIdentity.path, foldedIdentifiers);
  const entries: WorkbookScoreEntry[] = [];
  const rows: { path: string; sheetName: string; rowIndex: number }[] = [];

  for (const sheet of sheets) {
    for (const matchedRow of sheet.matchedRows) {
      const parsedEntries = parseWorkbookRow({
        workbook: workbookIdentity,
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

async function parseTabularDocument(workbookIdentity: LocalWorkbookIdentity, identifiers: readonly string[]) {
  const text = await readTabularDocumentText(workbookIdentity.path);
  if (!text) {
    return { entries: [], rows: [] };
  }

  const extension = path.extname(workbookIdentity.path).toLowerCase();
  if (extension === ".pdf") {
    const parsedFixedWidth = parseFixedWidthResultDocument(workbookIdentity, text, identifiers);
    if (parsedFixedWidth.entries.length > 0) {
      return parsedFixedWidth;
    }
  }

  return parseStackedResultDocument(workbookIdentity, text, identifiers);
}

function getWorkbookFallbackPath(workbook: WorkbookIdentity, syncFolder?: string) {
  const courseDir = ["folder", "assign", "book"].includes(workbook.module.modname)
    ? path.join(getAnalysisCourseFolder(workbook.course, syncFolder), sanitize(workbook.module.name))
    : getAnalysisCourseFolder(workbook.course, syncFolder);

  return path.join(courseDir, sanitize(workbook.contentFilename));
}

async function collectSheetSnapshots(workbookPath: string, identifiers: readonly string[]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  const sheets: ParsedSheetSnapshot[] = [];

  for (const worksheet of workbook.worksheets) {
    const headerRows: string[][] = [];
    const matchedRows: ParsedWorkbookRow[] = [];
    const columnMaxima = new Map<number, number>();

    worksheet.eachRow({ includeEmpty: false }, (row, rowIndex) => {
      const values = normalizeRowValues(row.values);
      const maxColumn = getMaxColumn(values);
      const isDataRow = isLikelyWorkbookDataRow(values, maxColumn);

      if (rowIndex <= 5 && !isDataRow) {
        headerRows[rowIndex - 1] = readHeaderRow(values, maxColumn);
      }

      if (isDataRow) {
        updateColumnMaxima(columnMaxima, values, maxColumn);
      }

      if (rowMatchesIdentifiers(readIdentifierCells(values), identifiers)) {
        matchedRows.push({ rowIndex, values, maxColumn });
      }
    });

    if (matchedRows.length > 0) {
      const sheetName = worksheet.name || `Sheet ${sheets.length + 1}`;

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

async function readTabularDocumentText(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".pdf") {
    try {
      const extracted = await execFileUtf8("/opt/homebrew/bin/pdftotext", ["-layout", "-nopgbrk", filePath, "-"]);
      if (extracted.trim()) return extracted;
    } catch {
      /* try liteparse */
    }
  }

  if (extension === ".docx" || extension === ".doc") {
    try {
      const extracted = await execFileUtf8("/usr/bin/textutil", ["-convert", "txt", "-stdout", filePath]);
      if (extracted.trim()) return extracted;
    } catch {
      /* try liteparse */
    }
  }

  if (extension === ".txt" || extension === ".csv" || extension === ".tsv") {
    try {
      const extracted = await readFile(filePath, "utf8");
      if (extracted.trim()) return extracted;
    } catch {
      return null;
    }
  }

  try {
    const extracted = await readWithLiteparse(filePath);
    return extracted.trim() || null;
  } catch {
    return null;
  }
}

function getMaxColumn(values: unknown[]) {
  for (let index = values.length - 1; index >= 1; index--) {
    if (!isCellEmpty(values[index])) return index;
  }
  return 0;
}

function isLikelyWorkbookDataRow(values: unknown[], maxColumn: number) {
  const identifierCell = normalizeLabel(getCellText(values[1]));
  if (!identifierCell) return false;
  if (isIdentifierHeader(identifierCell) || isAdministrativeHeader(identifierCell)) return false;

  for (let colIndex = 2; colIndex <= maxColumn; colIndex++) {
    if (parseCellNumber(values[colIndex]) != null) {
      return true;
    }
  }

  return false;
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
  workbook,
  sheet,
  row,
}: {
  workbook: LocalWorkbookIdentity;
  sheet: ParsedSheetSnapshot;
  row: ParsedWorkbookRow;
}) {
  const entries: WorkbookScoreEntry[] = [];

  for (let colIndex = 2; colIndex <= row.maxColumn; colIndex++) {
    const rawValue = parseCellNumber(row.values[colIndex]);
    if (rawValue == null) continue;

    const header = detectHeader(sheet.headerRows, colIndex);
    const displayLabel = simplifyWorkbookLabel(header);
    const normalizedHeader = normalizeLabel(displayLabel);
    if (!displayLabel || isIdentifierHeader(normalizedHeader) || isAdministrativeHeader(header)) continue;
    if (QUESTION_HEADER_RE.test(asciiFold(header))) continue;

    const maxFromHeader = extractMaxFromHeader(header);
    const inferredMax = inferColumnMax(maxFromHeader, sheet.columnMaxima.get(colIndex) ?? rawValue);
    if (inferredMax == null || inferredMax <= 0 || inferredMax > 150) continue;

    const contextLabels = dedupeStrings([
      displayLabel,
      header,
      sheet.sheetName,
      workbook.moduleName,
      workbook.sectionName,
      workbook.contentFilename,
      path.basename(workbook.path),
      ...workbook.contextLabels,
    ]);

    entries.push({
      id: `${workbook.courseId}:${path.basename(workbook.path)}:${sheet.sheetName}:${row.rowIndex}:${colIndex}`,
      courseId: workbook.courseId,
      label: displayLabel,
      headerLabel: header,
      normalizedLabel: normalizedHeader,
      contextLabels,
      normalizedContextLabels: contextLabels.map((value) => normalizeLabel(value)).filter(Boolean),
      kind: classifyGradeKind(`${displayLabel} ${contextLabels.join(" ")}`, "xlsx"),
      raw: rawValue,
      max: inferredMax,
      pct: inferredMax ? (rawValue / inferredMax) * 100 : null,
      posted: true,
      source: "xlsx",
      workbookPath: workbook.path,
      sheetName: sheet.sheetName,
      rowIndex: row.rowIndex,
      columnIndex: colIndex,
    });
  }

  return entries;
}

function parseStackedResultDocument(workbook: LocalWorkbookIdentity, text: string, identifiers: readonly string[]) {
  const blocks = text
    .replace(/\r/g, "")
    .split(/\n\s*[•·●▪◦*-]+\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length < 2) {
    return { entries: [], rows: [] };
  }

  const headers = extractStackedDocumentHeaders(blocks[0]);
  if (headers.length < 2) {
    return { entries: [], rows: [] };
  }

  const dataHeaders = headers.slice(1);
  const allRows = blocks
    .slice(1)
    .map((block, index) => parseStackedDocumentRow(block, index + 1))
    .filter((row): row is ParsedDocumentRow => row != null);

  const columnMaxima = computeDocumentColumnMaxima(dataHeaders, allRows);
  const matchedRows = allRows.filter((row) => rowMatchesIdentifiers([normalizeLabel(row.identifier)], identifiers));
  const entries: WorkbookScoreEntry[] = [];
  const rows: { path: string; sheetName: string; rowIndex: number }[] = [];

  for (const row of matchedRows) {
    const parsedEntries = parseDocumentRowEntries({
      workbook,
      headers: dataHeaders,
      row,
      sheetName: "General",
      columnMaxima,
    });
    if (parsedEntries.length === 0) continue;
    entries.push(...parsedEntries);
    rows.push({ path: workbook.path, sheetName: "General", rowIndex: row.rowIndex });
  }

  return { entries, rows };
}

function parseFixedWidthResultDocument(workbook: LocalWorkbookIdentity, text: string, identifiers: readonly string[]) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim().length > 0);
  const firstRowIndex = lines.findIndex((line) => /^\s*\d+\s+[a-z0-9]{6}\b/i.test(line));
  if (firstRowIndex < 0) {
    return { entries: [], rows: [] };
  }

  const headerText = lines.slice(0, firstRowIndex).join("\n");
  const rowLines = collapseWrappedFixedWidthRows(lines.slice(firstRowIndex), firstRowIndex + 1);
  const matchedRows = rowLines.filter(({ line }) => {
    const identifier = line.match(/^\s*\d+\s+([a-z0-9]{6})\b/i)?.[1];
    return identifier ? rowMatchesIdentifiers([normalizeLabel(identifier)], identifiers) : false;
  });

  const entries: WorkbookScoreEntry[] = [];
  const rows: { path: string; sheetName: string; rowIndex: number }[] = [];

  for (const matchedRow of matchedRows) {
    const rowEntries = parseFixedWidthResultRow(workbook, headerText, matchedRow.line, matchedRow.rowIndex);
    if (rowEntries.length === 0) continue;
    entries.push(...rowEntries);
    rows.push({ path: workbook.path, sheetName: "General", rowIndex: matchedRow.rowIndex });
  }

  return { entries, rows };
}

function collapseWrappedFixedWidthRows(lines: readonly string[], baseRowIndex: number) {
  const rows: { line: string; rowIndex: number }[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (/^\s*\d+\s+[a-z0-9]{6}\b/i.test(line)) {
      rows.push({ line: line.trim(), rowIndex: baseRowIndex + index });
      continue;
    }

    const previous = rows.at(-1);
    if (!previous) continue;
    previous.line = `${previous.line} ${line.trim()}`.trim();
  }

  return rows;
}

function extractStackedDocumentHeaders(block: string) {
  const lines = block
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const identifierIndex = lines.findIndex((line) => IDENTIFIER_HEADER_RE.test(asciiFold(line)));
  if (identifierIndex < 0) {
    return [];
  }

  return lines.slice(identifierIndex).filter((line) => !isSerialColumnHeader(line));
}

function parseStackedDocumentRow(block: string, rowIndex: number) {
  const values = block
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (values.length < 2) return null;

  return {
    rowIndex,
    identifier: values[0]!,
    values: values.slice(1),
  } satisfies ParsedDocumentRow;
}

function computeDocumentColumnMaxima(headers: readonly string[], rows: readonly ParsedDocumentRow[]) {
  const columnMaxima = new Map<number, number>();

  for (const row of rows) {
    for (let index = 0; index < headers.length; index++) {
      const numericValue = extractDocumentNumericValue(row.values[index] ?? "", headers[index]!);
      if (numericValue == null) continue;
      columnMaxima.set(index + 1, Math.max(columnMaxima.get(index + 1) ?? numericValue, numericValue));
    }
  }

  return columnMaxima;
}

function parseDocumentRowEntries({
  workbook,
  headers,
  row,
  sheetName,
  columnMaxima,
}: {
  workbook: LocalWorkbookIdentity;
  headers: readonly string[];
  row: ParsedDocumentRow;
  sheetName: string;
  columnMaxima: Map<number, number>;
}) {
  const entries: WorkbookScoreEntry[] = [];

  for (let index = 0; index < headers.length; index++) {
    const header = headers[index]!;
    const displayLabel = simplifyWorkbookLabel(header);
    const normalizedHeader = normalizeLabel(displayLabel);
    if (!displayLabel || isIdentifierHeader(normalizedHeader) || isAdministrativeHeader(header)) continue;

    const rawText = row.values[index] ?? "";
    const rawValue = extractDocumentNumericValue(rawText, header);
    if (rawValue == null) continue;
    if (isDocumentSummaryLabel(displayLabel)) continue;
    if (isGradeOnlyResultValue(header, rawText, rawValue)) continue;

    const maxFromHeader = inferDocumentMaxFromHeader(header);
    const observedMax = columnMaxima.get(index + 1) ?? rawValue;
    const inferredMax = inferDocumentColumnMax(header, maxFromHeader, observedMax);
    if (inferredMax == null || inferredMax <= 0 || inferredMax > 150) continue;

    const contextLabels = dedupeStrings([
      displayLabel,
      header,
      sheetName,
      workbook.moduleName,
      workbook.sectionName,
      workbook.contentFilename,
      path.basename(workbook.path),
      ...workbook.contextLabels,
    ]);

    entries.push({
      id: `${workbook.courseId}:${path.basename(workbook.path)}:${sheetName}:${row.rowIndex}:${index + 1}`,
      courseId: workbook.courseId,
      label: displayLabel,
      headerLabel: header,
      normalizedLabel: normalizedHeader,
      contextLabels,
      normalizedContextLabels: contextLabels.map((value) => normalizeLabel(value)).filter(Boolean),
      kind: classifyGradeKind(displayLabel, "xlsx"),
      raw: rawValue,
      max: inferredMax,
      pct: inferredMax ? (rawValue / inferredMax) * 100 : null,
      posted: true,
      source: "xlsx",
      workbookPath: workbook.path,
      sheetName,
      rowIndex: row.rowIndex,
      columnIndex: index + 1,
    });
  }

  return entries;
}

function parseFixedWidthResultRow(workbook: LocalWorkbookIdentity, headerText: string, line: string, rowIndex: number) {
  const match = line.match(/^\s*\d+\s+([a-z0-9]{6})\s+(.*)$/i);
  if (!match) return [];

  const tokens = match[2]!.trim().split(/\s+/);
  if (tokens.length < 10) return [];

  const classActivityMax = extractWeightedSectionMax(headerText, /class\s+activity|classwork/i) ?? 20;
  const headerMaxima = extractFixedWidthHeaderMaxima(headerText);
  const midtermMax = headerMaxima[0] ?? 15;
  const finalExamMax = headerMaxima[1] ?? 30;
  const assignmentMax = extractAssignmentMax(headerText) ?? headerMaxima[2] ?? 35;

  const columnSpecs = [
    {
      label: "Class activity",
      header: `Class activity (max ${classActivityMax})`,
      raw: parseLocaleNumber(tokens[0]) != null ? (parseLocaleNumber(tokens[0]) ?? 0) * 100 : null,
      max: classActivityMax,
    },
    {
      label: "Mid-term exam",
      header: `Mid-term exam (max ${midtermMax})`,
      raw: parseLocaleNumber(tokens[1]),
      max: midtermMax,
    },
    {
      label: "Final exam",
      header: `Final exam (max ${finalExamMax})`,
      raw: parseLocaleNumber(tokens[3]),
      max: finalExamMax,
    },
    {
      label: "Assignment",
      header: `Assignment (max ${assignmentMax})`,
      raw: parseLocaleNumber(tokens[5]),
      max: assignmentMax,
    },
  ] as const;

  return columnSpecs.flatMap((spec, index) =>
    spec.raw == null
      ? []
      : buildFixedWidthEntries(workbook, rowIndex, index + 1, spec.label, spec.header, spec.raw, spec.max),
  );
}

function buildFixedWidthEntries(
  workbook: LocalWorkbookIdentity,
  rowIndex: number,
  columnIndex: number,
  label: string,
  headerLabel: string,
  raw: number,
  max: number,
) {
  const contextLabels = dedupeStrings([
    label,
    headerLabel,
    "General",
    workbook.moduleName,
    workbook.sectionName,
    workbook.contentFilename,
    path.basename(workbook.path),
    ...workbook.contextLabels,
  ]);

  return [
    {
      id: `${workbook.courseId}:${path.basename(workbook.path)}:General:${rowIndex}:${columnIndex}`,
      courseId: workbook.courseId,
      label,
      headerLabel,
      normalizedLabel: normalizeLabel(label),
      contextLabels,
      normalizedContextLabels: contextLabels.map((value) => normalizeLabel(value)).filter(Boolean),
      kind: classifyGradeKind(label, "xlsx"),
      raw,
      max,
      pct: max ? (raw / max) * 100 : null,
      posted: true,
      source: "xlsx" as const,
      workbookPath: workbook.path,
      sheetName: "General",
      rowIndex,
      columnIndex,
    } satisfies WorkbookScoreEntry,
  ];
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

function simplifyWorkbookLabel(header: string) {
  const clean = header.replace(/\s+/g, " ").trim();
  const segments = clean
    .split("/")
    .map((segment) => normalizeHeaderPart(segment))
    .filter(Boolean);
  if (segments.length < 2) return clean;

  const tail = segments.at(-1) ?? clean;
  const prefix = segments
    .slice(0, -1)
    .map((segment) => normalizeLabel(segment))
    .join(" ");
  const genericPrefix =
    /^(?:class participation \d+ ?|course assignment \d+ ?|bonus points max \d+ ?|exam \d+ ?)(?: .*)?$/i.test(prefix) ||
    /(?:\bclass participation\b|\bcourse assignment\b|\bbonus points\b|\bexam\b)/.test(prefix);

  return genericPrefix ? tail : clean;
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

function isSerialColumnHeader(value: string) {
  const normalized = normalizeLabel(value);
  return /^(ssz|sorszam|sorszam|no|number|rank|#)$/.test(normalized);
}

function normalizeHeaderPart(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getCellText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value) {
    if ("result" in value) {
      return getCellText((value as { result?: unknown }).result);
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
    }
  }
  return String(value);
}

function parseCellNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value && "result" in value) {
    return parseCellNumber((value as { result?: unknown }).result);
  }
  const text = getCellText(value).trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function extractDocumentNumericValue(value: string, header: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return null;

  const pointValue = extractPointValue(trimmed);
  if (pointValue != null) return pointValue;

  const headerNorm = normalizeLabel(header);
  const gradeValue = extractGradeNumber(trimmed);
  if (gradeValue != null && /\b(grade|jegy|eredmeny|result)\b/.test(headerNorm)) {
    return gradeValue;
  }

  if (gradeValue != null && !/\b(weight|percent|percentage|ects)\b/.test(headerNorm)) {
    return gradeValue;
  }

  return parseLocaleNumber(trimmed);
}

function isDocumentSummaryLabel(label: string) {
  const normalized = normalizeLabel(label);
  return /\b(hungarian grade|final percentage|ects|neptun ba jegy|szeminariumi jegy)\b/.test(normalized);
}

function isGradeOnlyResultValue(header: string, value: string, rawValue: number) {
  const normalizedHeader = normalizeLabel(header);
  if (!/\beredmeny\b/.test(normalizedHeader)) return false;
  if (/\b(?:pont|points?)\b/i.test(asciiFold(value))) return false;
  return rawValue <= 5;
}

function extractPointValue(value: string) {
  const folded = asciiFold(value).toLowerCase().replaceAll(",", ".");
  if (!/\b(?:pont|points?)\b/.test(folded)) return null;

  const summed = folded.match(/(-?\d+(?:\.\d+)?)\s*(?:pont|points?)\s*\+\s*(-?\d+(?:\.\d+)?)/);
  if (summed) {
    return Number(summed[1]) + Number(summed[2]);
  }

  const matches = [...folded.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:pont|points?)/g)];
  if (matches.length > 0) {
    return Number(matches.at(-1)?.[1] ?? "");
  }

  return null;
}

function extractGradeNumber(value: string) {
  const parenValue = value.match(/\((\d+(?:[.,]\d+)?)\)/)?.[1];
  if (parenValue) {
    return Number(parenValue.replace(",", "."));
  }

  const normalized = normalizeLabel(value).replace(/\s+/g, "");
  for (const [term, grade] of Object.entries(GRADE_WORD_TO_VALUE)) {
    if (normalized.includes(term)) return grade;
  }

  return null;
}

function parseLocaleNumber(value: string) {
  const match = value
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".")
    .match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function isCellEmpty(value: unknown) {
  return getCellText(value).trim().length === 0;
}

function extractMaxFromHeader(header: string) {
  const clean = header.replace(/\s+/g, " ").trim();
  const segments = clean
    .split("/")
    .map((segment) => normalizeHeaderPart(segment))
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    const hasLetters = /[a-z]/i.test(asciiFold(segment));
    if (hasLetters) {
      const parsed = extractNumericHint(segment);
      if (parsed != null) return parsed;
    }

    if (!hasLetters || index === 0) continue;

    const numericHint = parseNumber(segments[index - 1]);
    if (numericHint != null) return numericHint;
  }

  for (let index = segments.length - 1; index >= 0; index--) {
    const parsed = parseNumber(segments[index]);
    if (parsed != null) return parsed;
  }

  return null;
}

function inferDocumentMaxFromHeader(header: string) {
  const explicit = extractMaxFromHeader(header);
  if (explicit != null) return explicit;

  const normalized = normalizeLabel(header);
  if (/\b(grade|jegy)\b/.test(normalized)) return 5;
  return null;
}

function inferDocumentColumnMax(header: string, maxFromHeader: number | null, observedMax: number) {
  if (maxFromHeader != null && maxFromHeader > 0) {
    if (observedMax <= maxFromHeader + Math.max(0.2, maxFromHeader * 0.05)) {
      return maxFromHeader;
    }
    return Math.max(maxFromHeader, roundObservedMax(observedMax));
  }

  const normalized = normalizeLabel(header);
  if (/\b(grade|jegy)\b/.test(normalized) && observedMax <= 5) {
    return 5;
  }
  if (/\b(zh|dolgozat|exam|vizsga|eredmeny)\b/.test(normalized) && observedMax > 20 && observedMax < 25) {
    return 25;
  }
  if (/\b(zh|dolgozat|exam|vizsga|eredmeny)\b/.test(normalized) && observedMax > 40 && observedMax < 50) {
    return 50;
  }

  return roundObservedMax(observedMax);
}

function inferColumnMax(maxFromHeader: number | null, observedMax: number) {
  if (maxFromHeader != null && maxFromHeader > 0) {
    if (observedMax <= maxFromHeader + Math.max(0.2, maxFromHeader * 0.02)) {
      return maxFromHeader;
    }
    return Math.max(maxFromHeader, roundObservedMax(observedMax));
  }

  return roundObservedMax(observedMax);
}

function roundObservedMax(observedMax: number) {
  for (const target of ROUND_TARGETS) {
    if (Math.abs(observedMax - target) <= Math.max(0.2, target * 0.08)) {
      return target;
    }
  }

  return observedMax <= 10 ? Math.round(observedMax * 2) / 2 : Math.round(observedMax);
}

function isIdentifierHeader(value: string) {
  return !value || IDENTIFIER_HEADER_RE.test(asciiFold(value));
}

function isAdministrativeHeader(value: string) {
  const normalized = normalizeLabel(value);
  if (ADMIN_HEADER_RE.test(normalized)) return true;

  const segments = value
    .split("/")
    .map((segment) => normalizeHeaderPart(segment))
    .filter(Boolean);
  const tail = normalizeLabel(segments.at(-1) ?? value);
  return /^(?:total|grade|final grade|overall grade|overall result|sum)(?: \d+(?:\.\d+)?)?$/.test(tail);
}

function isWorkbookCandidate(module: Module, filename: string) {
  const blob = normalizeLabel(`${module.name} ${filename}`);
  const workbookKeywords = [
    "score",
    "scores",
    "grade",
    "grades",
    "point",
    "points",
    "result",
    "results",
    "jegy",
    "eredmeny",
    "eredmenyek",
    "vizsgaeredmeny",
    "neptun",
  ];
  return (
    TABULAR_DOC_EXTENSIONS.has(path.extname(filename).toLowerCase()) &&
    workbookKeywords.some((keyword) => blob.includes(keyword))
  );
}

function getWorkbookLocalPath(filename: string, module: Module, course: SimpleCourse, syncFolder?: string) {
  const courseDir = ["folder", "assign", "book"].includes(module.modname)
    ? path.join(getCourseFolder(course, syncFolder), sanitize(module.name))
    : getCourseFolder(course, syncFolder);

  return path.join(courseDir, sanitize(filename));
}

function getCourseFolder(course: Pick<SimpleCourse, "displayname">, syncFolder?: string) {
  const courseName = sanitize(course.displayname);
  return syncFolder ? path.join(syncFolder, courseName) : courseName;
}

function dedupeStrings(values: readonly string[]) {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) unique.add(trimmed);
  }
  return [...unique];
}

function extractNumericHint(value: string) {
  const patterns = [
    /\bmax\.?\s*(\d+(?:[.,]\d+)?)\b/gi,
    /\bgrade\s*\/\s*(\d+(?:[.,]\d+)?)\b/gi,
    /\((\d+(?:[.,]\d+)?)\)/g,
    /\/\s*(\d+(?:[.,]\d+)?)\s*$/g,
  ];

  for (const pattern of patterns) {
    const matches = [...value.matchAll(pattern)];
    if (matches.length === 0) continue;

    const parsed = parseNumber(matches.at(-1)?.[1]);
    if (parsed != null) return parsed;
  }

  return null;
}

function extractAssignmentMax(headerText: string) {
  const folded = asciiFold(headerText).replace(/\s+/g, " ");
  const match = folded.match(
    /assignment[^]{0,120}?max\s*(\d+(?:[.,]\d+)?)(?:\s*points?)?(?:\s*\(\s*\+\/-\s*(\d+(?:[.,]\d+)?)\s*\))?/i,
  );
  const headerMaxima = extractFixedWidthHeaderMaxima(headerText);
  const base = headerMaxima[2] ?? (match?.[1] ? Number(match[1].replace(",", ".")) : null);
  if (base == null) return null;
  const extra =
    match?.[2] != null ? Number(match[2].replace(",", ".")) : /\(\s*\+\/-\s*\d+(?:[.,]\d+)?\s*\)/i.test(folded) ? 5 : 0;
  return base + extra;
}

function extractWeightedSectionMax(headerText: string, labelPattern: RegExp) {
  const folded = asciiFold(headerText).replace(/\s+/g, " ");
  const match = folded.match(new RegExp(`(?:${labelPattern.source})[^\\n]{0,120}?\\((\\d+(?:[.,]\\d+)?)%\\)`, "i"));
  if (!match?.[1]) return null;
  return Number(match[1].replace(",", "."));
}

function extractFixedWidthHeaderMaxima(headerText: string) {
  return [...asciiFold(headerText).matchAll(/max\s*(\d+(?:[.,]\d+)?)\s*points?/gi)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
}

async function readWithLiteparse(filePath: string) {
  const parser = await getLiteParseInstance();
  const result = await parser.parse(filePath, true);
  return result.text.trim();
}

async function getLiteParseInstance() {
  if (!liteParseInstancePromise) {
    liteParseInstancePromise = import("@llamaindex/liteparse").then(({ LiteParse }) => {
      return new LiteParse({
        outputFormat: "text",
        ocrLanguage: ["eng", "hun"],
      });
    });
  }

  return await liteParseInstancePromise;
}

async function execFileUtf8(command: string, args: readonly string[]) {
  return await new Promise<string>((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", maxBuffer: 12 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout.trim());
    });
  });
}
