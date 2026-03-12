import { getOrdinalHint, getWeekHint, jaccardScore, normalizeLabel, tokenize } from "./text";
import {
  GradeCandidate,
  MatchedCandidateRef,
  MatchedLeafRow,
  MatchedSection,
  MoodleGradeRow,
  ParsedSyllabusComponent,
  ParsedSyllabusDocument,
  WorkbookScoreEntry,
} from "./types";

type MatchScore = {
  semantic: number;
  temporal: number;
  ordinal: number;
  fuzzy: number;
};

type LeafDescriptor = {
  id: string;
  parentLabel: string;
  component: ParsedSyllabusComponent;
};

export function matchSyllabusToGrades(
  parsed: ParsedSyllabusDocument,
  moodleRows: MoodleGradeRow[],
  workbookRows: WorkbookScoreEntry[],
) {
  const moodleUnused = new Set(moodleRows.map((row) => row.id));
  const workbookUnused = new Set(workbookRows.map((row) => row.id));
  const sections = parsed.components.map((component, sectionIndex) =>
    matchSection(component, sectionIndex, moodleRows, workbookRows, moodleUnused, workbookUnused),
  );

  const unassignedMoodleRows = moodleRows
    .filter((row) => moodleUnused.has(row.id))
    .map(toMatchedCandidateRef)
    .sort((left, right) => left.label.localeCompare(right.label));

  const workbookRowsUsed = sections
    .flatMap((section) => section.rows)
    .flatMap((row) => [row.moodle, row.xlsx])
    .filter((row): row is MatchedCandidateRef => row != null && row.source === "xlsx");

  return { sections, unassignedMoodleRows, workbookRowsUsed };
}

function matchSection(
  component: ParsedSyllabusComponent,
  sectionIndex: number,
  moodleRows: MoodleGradeRow[],
  workbookRows: WorkbookScoreEntry[],
  moodleUnused: Set<string>,
  workbookUnused: Set<string>,
): MatchedSection {
  const leaves = flattenLeaves(component, component.name, `${sectionIndex}`);
  const matchedLeaves = matchLeaves(leaves, moodleRows, workbookRows, moodleUnused, workbookUnused);
  const rollup = computeSectionRollup(component, matchedLeaves);

  return {
    id: `${sectionIndex}:${normalizeLabel(component.name)}`,
    label: component.name,
    maxPoints: component.max_points ?? null,
    rows: matchedLeaves,
    postedPoints: rollup.postedPoints,
    totalPoints: rollup.totalPoints,
    effectivePercent: rollup.effectivePercent,
  };
}

function flattenLeaves(component: ParsedSyllabusComponent, parentLabel: string, prefix: string): LeafDescriptor[] {
  const children = component.children ?? [];
  if (children.length === 0) {
    return [{ id: prefix, parentLabel, component }];
  }

  return children.flatMap((child, index) => flattenLeaves(child, parentLabel, `${prefix}:${index}`));
}

function matchLeaves(
  leaves: LeafDescriptor[],
  moodleRows: MoodleGradeRow[],
  workbookRows: WorkbookScoreEntry[],
  moodleUnused: Set<string>,
  workbookUnused: Set<string>,
) {
  const rows = leaves.map((leaf) => buildInitialLeaf(leaf));

  matchStrongRows(rows, moodleRows, moodleUnused, "moodle");
  matchStrongRows(rows, workbookRows, workbookUnused, "xlsx");
  matchSequentialRows(rows, moodleRows, moodleUnused, "moodle");
  matchSequentialRows(rows, workbookRows, workbookUnused, "xlsx");
  supplementWithWorkbook(rows, workbookRows, workbookUnused);

  return rows.map((row) => finalizeLeaf(row));
}

function buildInitialLeaf({ id, parentLabel, component }: LeafDescriptor) {
  return {
    id,
    parentLabel,
    component,
    moodle: null as GradeCandidate | null,
    xlsx: null as GradeCandidate | null,
  };
}

function matchStrongRows(
  rows: ReturnType<typeof buildInitialLeaf>[],
  candidates: GradeCandidate[],
  unusedIds: Set<string>,
  source: "moodle" | "xlsx",
) {
  const ranked = rows
    .filter((row) => row[source] == null)
    .flatMap((row) =>
      candidates
        .filter((candidate) => unusedIds.has(candidate.id) && isCompatibleKind(row.component.kind, candidate.kind))
        .map((candidate) => ({
          row,
          candidate,
          score: scoreComponentCandidate(row.component, candidate),
        })),
    )
    .filter(({ score }) => score.semantic >= 2 || (score.semantic >= 1 && score.temporal >= 1))
    .sort(compareRankedMatches);

  for (const match of ranked) {
    if (match.row[source] != null || !unusedIds.has(match.candidate.id)) continue;
    match.row[source] = match.candidate;
    unusedIds.delete(match.candidate.id);
  }
}

function matchSequentialRows(
  rows: ReturnType<typeof buildInitialLeaf>[],
  candidates: GradeCandidate[],
  unusedIds: Set<string>,
  source: "moodle" | "xlsx",
) {
  const sequentialRows = rows.filter(
    (row) => row[source] == null && (row.component.index != null || row.component.group || row.component.count != null),
  );
  const groups = new Map<string, typeof sequentialRows>();

  for (const row of sequentialRows) {
    const key = normalizeLabel(row.component.group || row.component.kind || row.parentLabel);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  for (const groupRows of groups.values()) {
    const orderedRows = groupRows.toSorted(
      (left, right) =>
        (left.component.index ?? Number.MAX_SAFE_INTEGER) - (right.component.index ?? Number.MAX_SAFE_INTEGER),
    );
    const pool = candidates
      .filter((candidate) => unusedIds.has(candidate.id))
      .filter((candidate) =>
        orderedRows.some(
          (row) =>
            isCompatibleKind(row.component.kind, candidate.kind) &&
            scoreComponentCandidate(row.component, candidate).semantic >= 1,
        ),
      )
      .toSorted((left, right) => {
        const leftOrdinal = getOrdinalHint(left.label) ?? Number.MAX_SAFE_INTEGER;
        const rightOrdinal = getOrdinalHint(right.label) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrdinal !== rightOrdinal) return leftOrdinal - rightOrdinal;
        return left.label.localeCompare(right.label);
      });

    for (const row of orderedRows) {
      const match = chooseSequentialCandidate(row.component, pool, unusedIds);
      if (!match) continue;
      row[source] = match;
      unusedIds.delete(match.id);
    }
  }
}

function chooseSequentialCandidate(
  component: ParsedSyllabusComponent,
  candidates: GradeCandidate[],
  unusedIds: Set<string>,
) {
  const sequentialRanked = candidates
    .filter((candidate) => unusedIds.has(candidate.id) && isCompatibleKind(component.kind, candidate.kind))
    .map((candidate) => ({ candidate, score: scoreComponentCandidate(component, candidate) }))
    .filter(({ score }) => score.semantic >= 1)
    .sort(compareRankedMatches);

  if (component.week_hint || component.deadline_hint) {
    const temporal = sequentialRanked.find(({ score }) => score.temporal > 0);
    if (temporal) return temporal.candidate;
  }

  const exactOrdinal = sequentialRanked.find(({ score }) => score.ordinal > 0);
  if (exactOrdinal) return exactOrdinal.candidate;

  const fallbackIndex = Math.max(0, (component.index ?? 1) - 1);
  return sequentialRanked[fallbackIndex]?.candidate ?? sequentialRanked[0]?.candidate ?? null;
}

function supplementWithWorkbook(
  rows: ReturnType<typeof buildInitialLeaf>[],
  workbookRows: WorkbookScoreEntry[],
  unusedIds: Set<string>,
) {
  for (const row of rows) {
    if (!row.moodle || row.xlsx) continue;
    const moodleLabel = normalizeLabel(row.moodle.label);
    const supplement = workbookRows
      .filter((candidate) => unusedIds.has(candidate.id))
      .find((candidate) => {
        const candidateLabel = normalizeLabel(candidate.label);
        return candidateLabel === moodleLabel || jaccardScore(tokenize(candidateLabel), tokenize(moodleLabel)) >= 0.75;
      });

    if (!supplement) continue;
    row.xlsx = supplement;
    unusedIds.delete(supplement.id);
  }
}

function finalizeLeaf(row: ReturnType<typeof buildInitialLeaf>): MatchedLeafRow {
  const effective = pickEffectiveCandidate(row.moodle, row.xlsx);
  const moodle = row.moodle ? toMatchedCandidateRef(row.moodle) : null;
  const xlsx = row.xlsx ? toMatchedCandidateRef(row.xlsx) : null;

  let source: MatchedLeafRow["source"] = "unposted";
  if (moodle && xlsx) source = "both";
  else if (moodle) source = "moodle";
  else if (xlsx) source = "xlsx";

  return {
    id: row.id,
    label: row.component.name,
    parentLabel: row.parentLabel,
    kind: row.component.kind || "other",
    group: row.component.group ?? null,
    index: row.component.index ?? null,
    count: row.component.count ?? null,
    deadlineHint: row.component.deadline_hint ?? null,
    weekHint: row.component.week_hint ?? null,
    maxPoints: row.component.max_points ?? null,
    effective: effective ? toMatchedCandidateRef(effective) : null,
    moodle,
    xlsx,
    source,
    evidence: (row.component.evidence ?? []).filter(Boolean),
  };
}

function pickEffectiveCandidate(moodle: GradeCandidate | null, xlsx: GradeCandidate | null) {
  if (moodle?.posted) {
    return moodle;
  }
  if (xlsx?.posted) {
    return xlsx;
  }
  return moodle ?? xlsx ?? null;
}

function computeSectionRollup(component: ParsedSyllabusComponent, rows: MatchedLeafRow[]) {
  const effectiveRows = rows
    .map((row) => row.effective)
    .filter((row): row is MatchedCandidateRef => row != null && row.max != null);
  const postedPoints = effectiveRows.reduce((sum, row) => sum + (row.raw ?? 0), 0);
  const candidateTotalPoints =
    component.max_points ?? (rows.reduce((sum, row) => sum + (row.maxPoints ?? row.effective?.max ?? 0), 0) || null);

  const totalPoints = candidateTotalPoints && candidateTotalPoints > 0 ? candidateTotalPoints : null;
  const effectivePercent = totalPoints && postedPoints >= 0 ? (postedPoints / totalPoints) * 100 : null;

  return { postedPoints: totalPoints ? postedPoints : null, totalPoints, effectivePercent };
}

function scoreComponentCandidate(component: ParsedSyllabusComponent, candidate: GradeCandidate): MatchScore {
  const componentLabel = normalizeLabel(component.name);
  const candidateLabel = normalizeLabel(candidate.label);
  const componentTokens = tokenize(componentLabel);
  const candidateTokens = tokenize(candidateLabel);
  const overlap = [...componentTokens].filter((token) => candidateTokens.has(token)).length;
  const jaccard = jaccardScore(componentTokens, candidateTokens);

  let semantic = 0;
  if (componentLabel === candidateLabel) semantic = 3;
  else if (candidateLabel.includes(componentLabel) || componentLabel.includes(candidateLabel) || jaccard >= 0.74)
    semantic = 2;
  else if (overlap > 0 || isCompatibleKind(component.kind, candidate.kind)) semantic = 1;

  const isAggregateTotal = /\b(total|overall|sum)\b/.test(candidateLabel);
  if (isAggregateTotal && (component.index != null || component.group || component.count != null) && semantic < 2) {
    semantic = 0;
  }

  let temporal = 0;
  const componentWeek = component.week_hint ?? getWeekHint(component.name);
  const candidateWeek = getWeekHint(candidate.label);
  if (componentWeek && candidateWeek && componentWeek === candidateWeek) temporal = 2;
  else if (component.deadline_hint && candidateLabel.includes(normalizeLabel(component.deadline_hint))) temporal = 2;
  else if (componentWeek && candidateLabel.includes(componentWeek)) temporal = 1;

  let ordinal = 0;
  const componentOrdinal = component.index ?? getOrdinalHint(component.name);
  const candidateOrdinal = getOrdinalHint(candidate.label);
  if (componentOrdinal != null && candidateOrdinal != null && componentOrdinal === candidateOrdinal) ordinal = 2;

  return {
    semantic,
    temporal,
    ordinal,
    fuzzy: jaccard + overlap * 0.15 + (candidate.posted ? 0.2 : 0) - (isAggregateTotal ? 0.6 : 0),
  };
}

function compareRankedMatches(
  left: { score: MatchScore; candidate: GradeCandidate },
  right: { score: MatchScore; candidate: GradeCandidate },
) {
  if (right.score.semantic !== left.score.semantic) return right.score.semantic - left.score.semantic;
  if (right.score.temporal !== left.score.temporal) return right.score.temporal - left.score.temporal;
  if (right.score.ordinal !== left.score.ordinal) return right.score.ordinal - left.score.ordinal;
  if (right.score.fuzzy !== left.score.fuzzy) return right.score.fuzzy - left.score.fuzzy;
  if (left.candidate.source !== right.candidate.source) return left.candidate.source === "moodle" ? -1 : 1;
  return left.candidate.label.localeCompare(right.candidate.label);
}

function isCompatibleKind(componentKind: string | null | undefined, candidateKind: string) {
  if (!componentKind || componentKind === "other") return true;
  if (componentKind === candidateKind) return true;

  const alternatives: Record<string, Set<string>> = {
    assignment: new Set(["assignment", "project", "presentation", "group_assignment", "other"]),
    group_assignment: new Set(["group_assignment", "assignment", "project"]),
    project: new Set(["project", "assignment", "group_assignment"]),
    presentation: new Set(["presentation", "assignment"]),
    quiz: new Set(["quiz", "midterm", "final_exam"]),
    midterm: new Set(["midterm", "quiz"]),
    final_exam: new Set(["final_exam", "quiz", "other"]),
  };

  return alternatives[componentKind]?.has(candidateKind) ?? false;
}

function toMatchedCandidateRef(candidate: GradeCandidate): MatchedCandidateRef {
  return {
    id: candidate.id,
    source: candidate.source,
    label: candidate.label,
    raw: candidate.raw,
    max: candidate.max,
    pct: candidate.pct,
    courseId: candidate.courseId,
    workbookPath: candidate.source === "xlsx" ? candidate.workbookPath : undefined,
    sheetName: candidate.source === "xlsx" ? candidate.sheetName : undefined,
  };
}
