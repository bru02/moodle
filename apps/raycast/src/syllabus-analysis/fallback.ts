import { classifyGradeKind } from "./pure-utils";
import { MoodleGradeRow, ParsedSyllabusComponent, ParsedSyllabusDocument, WorkbookScoreEntry } from "./types";

type FallbackDocument = {
  sourceLabel: string;
  text: string;
};

type GradeLikeRow = Pick<MoodleGradeRow, "label" | "kind" | "raw" | "max" | "normalizedLabel"> & {
  source?: "moodle" | "xlsx";
};

const GRADING_HEADING_PATTERN =
  /\b(assessment|assessments|grading|grading scale|evaluation|assessment system|ertekeles|ertékelés|ertekelesi|értékelési|pontozas|pontozás)\b/i;
const GRADING_SIGNAL_PATTERN =
  /\b(\d+(?:[.,]\d+)?)\s*(%|points?|pts?|pont)\b|\b(midterm|final|exam|quiz|assignment|project|presentation|participation|bonus|extra|zh|zarthelyi|zárthelyi|vizsga)\b/i;
const SECTION_BREAK_PATTERN = /^\s*(?:\d{1,2}[.)]|[A-Z][A-Za-z\s]+:)\s+/;
const RANGE_ONLY_PATTERN = /^\s*[\p{L}\s/()'-]+\s+\d+\s*-\s*\d+\s*$/u;
const PRIMARY_GRADING_START_PATTERN =
  /\b(assessment,\s*grading|assessment method|evaluation system of the course|ertekelesi rendszer|értékelési rendszer|szamonkeres modja|számonkérés módja)\b/i;
const HEADING_SKIP_PATTERN =
  /\b(ilo\d+|intended learning outcomes|assessment ensuring ilos|observable trait|meets expectations|fails to meet expectations|exceeds expectations)\b/i;

export function extractGradingFocusedText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) return "";

  const anchored = extractPrimaryGradingWindow(lines);
  if (anchored) return anchored;

  const keep = new Set<number>();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!GRADING_HEADING_PATTERN.test(line)) continue;

    const start = Math.max(0, index - 2);
    const end = Math.min(lines.length - 1, index + 45);

    for (let cursor = start; cursor <= end; cursor++) {
      const candidate = lines[cursor]!;
      if (cursor > index + 2 && SECTION_BREAK_PATTERN.test(candidate) && !GRADING_SIGNAL_PATTERN.test(candidate)) {
        break;
      }
      keep.add(cursor);
    }
  }

  for (let index = 0; index < lines.length; index++) {
    if (!GRADING_SIGNAL_PATTERN.test(lines[index]!)) continue;
    const start = Math.max(0, index - 1);
    const end = Math.min(lines.length - 1, index + 1);
    for (let cursor = start; cursor <= end; cursor++) keep.add(cursor);
  }

  if (keep.size === 0) {
    return lines.slice(0, 140).join("\n");
  }

  const extracted: string[] = [];
  let previous = -2;
  for (const index of [...keep].sort((left, right) => left - right)) {
    const line = lines[index]!;
    if (SECTION_BREAK_PATTERN.test(line) && !GRADING_HEADING_PATTERN.test(line) && !GRADING_SIGNAL_PATTERN.test(line)) {
      continue;
    }
    if (index > previous + 1 && extracted.length > 0) extracted.push("");
    extracted.push(line);
    previous = index;
  }

  return extracted.join("\n").trim();
}

export function buildFallbackParsedSyllabus(params: {
  documents?: readonly FallbackDocument[];
  moodleRows: readonly MoodleGradeRow[];
  workbookRows: readonly WorkbookScoreEntry[];
}) {
  const fromDocuments = buildParsedSyllabusFromDocuments(params.documents ?? []);
  if (fromDocuments.components.length > 0) {
    return fromDocuments;
  }

  return buildParsedSyllabusFromGradeRows(params.moodleRows, params.workbookRows);
}

export function supplementParsedSyllabusWithObservedRows(params: {
  parsed: ParsedSyllabusDocument;
  documents?: readonly FallbackDocument[];
  moodleRows: readonly MoodleGradeRow[];
}) {
  return appendWeeklyTestComponentIfMissing(params.parsed, params.documents ?? [], params.moodleRows);
}

function buildParsedSyllabusFromDocuments(documents: readonly FallbackDocument[]): ParsedSyllabusDocument {
  const parsedComponents = documents.flatMap((document) =>
    parseDocumentComponents(extractGradingFocusedText(document.text)),
  );
  const deduped = dedupeComponents(parsedComponents);
  return {
    normal_total_points: sumKnownValues(deduped.map((component) => component.max_points ?? null)),
    components: deduped,
  };
}

function parseDocumentComponents(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const components: ParsedSyllabusComponent[] = [];
  let currentParent: ParsedSyllabusComponent | null = null;

  for (const line of lines) {
    if (RANGE_ONLY_PATTERN.test(line)) continue;
    if (looksLikeHeading(line) && !GRADING_SIGNAL_PATTERN.test(line)) {
      currentParent = null;
      continue;
    }

    const compound = parseCompoundComponent(line);
    if (compound) {
      components.push(compound);
      currentParent = compound;
      continue;
    }

    const scored = parseScoredLine(line);
    if (!scored) continue;

    const component: ParsedSyllabusComponent = {
      name: scored.label,
      kind: scored.kind,
      max_points: scored.maxPoints,
    };

    if (/^[-*•]/.test(line) && currentParent) {
      currentParent.children = [...(currentParent.children ?? []), component];
      if (currentParent.max_points == null && currentParent.children.every((child) => child.max_points != null)) {
        currentParent.max_points = sumKnownValues(currentParent.children.map((child) => child.max_points ?? null));
      }
      continue;
    }

    components.push(component);
    currentParent = component;
  }

  return components;
}

function buildParsedSyllabusFromGradeRows(
  moodleRows: readonly MoodleGradeRow[],
  workbookRows: readonly WorkbookScoreEntry[],
): ParsedSyllabusDocument {
  const rows = dedupeGradeRows(
    [...moodleRows, ...workbookRows]
      .filter((row) => row.label.trim().length > 0)
      .filter((row) => row.max != null || row.raw != null)
      .filter((row) => !/\b(attendance|attendance sheet|jelenlet|jelenléti)\b/i.test(row.label))
      .filter((row) => !/^(score|grade|result|eredmeny|eredmény)$/i.test(row.label.trim())),
  );

  const grouped = new Map<string, ParsedSyllabusComponent[]>();
  for (const row of rows) {
    const child: ParsedSyllabusComponent = {
      name: row.label,
      kind: row.kind,
      max_points: row.max,
    };
    const bucket = grouped.get(row.kind) ?? [];
    bucket.push(child);
    grouped.set(row.kind, bucket);
  }

  const components = [...grouped.entries()]
    .sort((left, right) => kindOrder(left[0]) - kindOrder(right[0]))
    .map(([kind, children]) => {
      const dedupedChildren = dedupeComponents(children);
      const max_points = sumKnownValues(dedupedChildren.map((child) => child.max_points ?? null));
      return {
        name: labelForKind(kind),
        kind,
        max_points,
        children: dedupedChildren,
      } satisfies ParsedSyllabusComponent;
    });

  return {
    normal_total_points: sumKnownValues(components.map((component) => component.max_points ?? null)),
    components,
  };
}

function appendWeeklyTestComponentIfMissing(
  parsed: ParsedSyllabusDocument,
  documents: readonly FallbackDocument[],
  moodleRows: readonly MoodleGradeRow[],
) {
  const hasWeeklyTestSignal =
    documents.some((document) => {
      const text = document.text.toLowerCase();
      return /\bheti teszt|weekly test/.test(text) && /\blegalabb 9|at least 9/.test(text);
    }) || moodleRows.filter((row) => /\bheti teszt|weekly test/.test(row.normalizedLabel)).length >= 4;
  if (!hasWeeklyTestSignal) return parsed;

  const alreadyCovered = parsed.components.some((component) =>
    /\bheti teszt|weekly test|weekly quiz|heti quiz/.test(component.name.toLowerCase()),
  );
  if (alreadyCovered) return parsed;

  const weeklyTests = moodleRows
    .filter((row) => /\bheti teszt|weekly test/.test(row.normalizedLabel))
    .toSorted((left, right) => getOrdinal(left.label) - getOrdinal(right.label));
  if (weeklyTests.length === 0) return parsed;

  const component: ParsedSyllabusComponent = {
    name: "Weekly tests",
    kind: "quiz",
    count: weeklyTests.length,
    children: weeklyTests.map((row, index) => ({
      name: `Heti teszt ${getOrdinal(row.label) || index + 1}`,
      kind: "quiz",
      max_points: row.max,
      index: getOrdinal(row.label) || index + 1,
    })),
    evidence: ["Observed recurring Moodle weekly tests"],
  };

  return {
    ...parsed,
    components: [component, ...parsed.components],
  };
}

function parseCompoundComponent(line: string): ParsedSyllabusComponent | null {
  const match = line.match(/^[-*•]?\s*(.+?)\s*\((.+)\)\s*:?\s*$/);
  if (!match) return null;

  const label = cleanLabel(match[1]!);
  const inner = match[2]!;
  if (!/[+;,]/.test(inner) || !/\d/.test(inner)) return null;

  const children = inner
    .split(/\s*[+;]\s*/)
    .map((part) => parseScoredLine(part))
    .filter((child): child is NonNullable<typeof child> => child != null)
    .map(
      (child) =>
        ({
          name: child.label,
          kind: child.kind,
          max_points: child.maxPoints,
        }) satisfies ParsedSyllabusComponent,
    );

  if (children.length === 0) return null;

  return {
    name: label,
    kind: classifyGradeKind(label),
    max_points: sumKnownValues(children.map((child) => child.max_points ?? null)),
    children,
  };
}

function parseScoredLine(line: string) {
  const trimmed = line.trim();
  const match = trimmed.match(/(\d+(?:[.,]\d+)?)\s*(%|points?|pts?|pont)\s*[:.]?$/i);
  if (!match) return null;

  const label = cleanLabel(trimmed.slice(0, match.index).replace(/^[-*•]\s*/, ""));
  if (label.length < 3) return null;
  if (/^(grade|osztalyzat|grade range)$/i.test(label)) return null;

  const amount = Number.parseFloat(match[1]!.replace(",", "."));
  const unit = match[2]!.toLowerCase();

  return {
    label,
    kind: classifyGradeKind(label),
    maxPoints: Number.isFinite(amount) ? amount : null,
    isPercent: unit.startsWith("%"),
  };
}

function dedupeComponents(components: readonly ParsedSyllabusComponent[]) {
  const merged = new Map<string, ParsedSyllabusComponent>();

  for (const component of components) {
    const signature = componentSignature(component);
    const existing = merged.get(signature);
    if (!existing) {
      merged.set(signature, cloneComponent(component));
      continue;
    }

    if (preferEnglishLabel(component.name, existing.name)) {
      existing.name = component.name;
      existing.kind = component.kind ?? existing.kind;
    }

    if (existing.max_points == null && component.max_points != null) {
      existing.max_points = component.max_points;
    }

    if (component.children?.length) {
      existing.children = dedupeComponents([...(existing.children ?? []), ...component.children]);
    }
  }

  return [...merged.values()];
}

function dedupeGradeRows(rows: readonly GradeLikeRow[]) {
  const deduped = new Map<string, GradeLikeRow>();
  for (const row of rows) {
    const key = `${row.kind}:${row.normalizedLabel}`;
    const existing = deduped.get(key);
    if (!existing || scoreGradeRow(row) > scoreGradeRow(existing)) {
      deduped.set(key, row);
    }
  }
  return [...deduped.values()];
}

function scoreGradeRow(row: GradeLikeRow) {
  let score = 0;
  if (row.raw != null) score += 4;
  if (row.max != null) score += 3;
  if (row.source === "moodle") score += 2;
  score += Math.min((row.label || "").length, 60) / 60;
  return score;
}

function componentSignature(component: ParsedSyllabusComponent) {
  const childSignature = (component.children ?? [])
    .map((child) => `${child.kind ?? ""}:${child.max_points ?? ""}`)
    .join("|");
  return `${component.kind ?? ""}:${component.max_points ?? ""}:${childSignature}`;
}

function cloneComponent(component: ParsedSyllabusComponent): ParsedSyllabusComponent {
  return {
    ...component,
    children: component.children?.map((child) => cloneComponent(child)),
  };
}

function preferEnglishLabel(candidate: string, current: string) {
  return asciiScore(candidate) > asciiScore(current);
}

function asciiScore(value: string) {
  return [...value].filter((char) => char.charCodeAt(0) < 128).length / Math.max(value.length, 1);
}

function kindOrder(kind: string) {
  const order = [
    "quiz",
    "midterm",
    "final_exam",
    "assignment",
    "project",
    "presentation",
    "participation",
    "extra",
    "other",
  ];
  const index = order.indexOf(kind);
  return index >= 0 ? index : order.length;
}

function labelForKind(kind: string) {
  switch (kind) {
    case "quiz":
      return "Quizzes";
    case "midterm":
      return "Midterm exams";
    case "final_exam":
    case "comprehensive_exam":
      return "Final exam";
    case "assignment":
      return "Assignments";
    case "project":
      return "Project work";
    case "presentation":
      return "Presentations";
    case "participation":
      return "Participation";
    case "extra":
      return "Extra credit";
    default:
      return "Other graded items";
  }
}

function sumKnownValues(values: readonly (number | null)[]) {
  if (values.length === 0 || values.some((value) => value == null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

function cleanLabel(value: string) {
  return normalizeWhitespace(value.replace(/^[-*•]\s*/, "").replace(/[:.]\s*$/, ""))
    .replace(/\s+\((?:\d[\d\s./-]*|[^)]*\b(?:people|group|csoport)\b[^)]*)\)\s*$/i, "")
    .replace(/\s+\(\s*$/, "")
    .trim();
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeHeading(line: string) {
  return /^(?:\d{1,2}[.)]\s+.+|[A-Z][A-Za-z\s/&-]{4,})$/.test(line.trim());
}

function getOrdinal(value: string) {
  const match = value.match(/\b(\d{1,2})\b/);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function extractPrimaryGradingWindow(lines: readonly string[]) {
  const start = lines.findIndex((line) => PRIMARY_GRADING_START_PATTERN.test(line));
  if (start < 0) return "";

  const selected: string[] = [];
  for (let index = start; index < lines.length && selected.length < 120; index++) {
    const line = lines[index]!;
    const normalized = normalizeWhitespace(line);
    if (!normalized) continue;
    if (HEADING_SKIP_PATTERN.test(normalized)) continue;

    if (
      index > start + 4 &&
      /^(?:\d{1,2}[.)]\s+.+|[IVX]+[.)]?\s+.+|[A-Z][A-Za-z].{0,60}:)$/.test(normalized) &&
      !GRADING_SIGNAL_PATTERN.test(normalized) &&
      !GRADING_HEADING_PATTERN.test(normalized)
    ) {
      break;
    }

    selected.push(line);
  }

  return selected.join("\n").trim();
}
