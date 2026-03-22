import { getOrdinalHint, getWeekHint, jaccardScore, normalizeLabel, tokenize } from "./text";
import {
  GradeCandidate,
  MatchedCandidateRef,
  MatchedLeafRow,
  MatchedSection,
  MoodleGradeRow,
  ParsedSyllabusComponent,
  ParsedSyllabusDocument,
} from "./types";

type MatchScore = {
  semantic: number;
  temporal: number;
  ordinal: number;
  maxCloseness: number;
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
  workbookRows: GradeCandidate[],
) {
  const moodleUnused = new Set(moodleRows.map((row) => row.id));
  const workbookUnused = new Set(workbookRows.map((row) => row.id));
  const sections = parsed.components.map((component, sectionIndex) =>
    matchSection(component, sectionIndex, moodleRows, workbookRows, moodleUnused, workbookUnused),
  );

  const unassignedMoodleRows = moodleRows
    .filter((row) => moodleUnused.has(row.id))
    .filter((row) => !shouldSuppressUnassignedRow(row, moodleRows, moodleUnused))
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
  workbookRows: GradeCandidate[],
  moodleUnused: Set<string>,
  workbookUnused: Set<string>,
): MatchedSection {
  const leaves = expandLeavesForMatching(component, sectionIndex, moodleRows, workbookRows);
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

function expandLeavesForMatching(
  component: ParsedSyllabusComponent,
  sectionIndex: number,
  moodleRows: MoodleGradeRow[],
  workbookRows: GradeCandidate[],
) {
  const expandedChildren = expandGenericChildLeaves(component, sectionIndex, moodleRows, workbookRows);
  if (expandedChildren) {
    return expandedChildren;
  }

  const flattened = flattenLeaves(component, component.name, `${sectionIndex}`);
  if ((component.children?.length ?? 0) > 0 || !shouldExpandAggregateComponent(component)) {
    return flattened;
  }

  const sourceRows = moodleRows.length > 0 ? moodleRows : workbookRows;
  const expanded = collapseVariantCandidates(
    sourceRows
      .filter((candidate) => isCompatibleKind(component.kind, candidate.kind, candidate.label))
      .filter((candidate) => !isAggregateCandidate(candidate.label))
      .filter((candidate) => !isAdministrativeCandidate(candidate.label))
      .filter((candidate) => shouldExpandAggregateCandidate(component, candidate))
      .toSorted(compareAggregateCandidates),
  );

  if (expanded.length < 2) {
    return flattened;
  }

  return expanded.map((candidate, index) => ({
    id: `${sectionIndex}:${index}`,
    parentLabel: component.name,
    component: {
      name: candidate.label,
      kind: candidate.kind || component.kind,
      max_points: candidate.max ?? null,
      group: normalizeLabel(component.name),
      index: index + 1,
      count: expanded.length,
      evidence: [candidate.label],
    } satisfies ParsedSyllabusComponent,
  }));
}

function expandGenericChildLeaves(
  component: ParsedSyllabusComponent,
  sectionIndex: number,
  moodleRows: MoodleGradeRow[],
  workbookRows: GradeCandidate[],
) {
  const children = component.children ?? [];
  if (!shouldExpandGenericChildPlaceholders(component, children)) {
    return null;
  }

  const placeholders = children
    .toSorted((left, right) => (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER))
    .map((child, index) => ({
      id: `${sectionIndex}:placeholder:${index}`,
      parentLabel: component.name,
      component: child,
    }));
  const sourceRows = moodleRows.length > 0 ? moodleRows : workbookRows;
  const concreteCandidates = collapseVariantCandidates(
    sourceRows.filter((candidate) => shouldMaterializeCandidate(component, candidate)),
  );

  if (concreteCandidates.length === 0) {
    return placeholders;
  }

  const concreteLeaves = concreteCandidates.map((candidate, index) => ({
    id: `${sectionIndex}:candidate:${index}`,
    parentLabel: component.name,
    component: {
      name: candidate.label,
      kind: candidate.kind || component.kind,
      max_points: candidate.max ?? null,
      group: normalizeLabel(component.name),
      index: index + 1,
      count: Math.max(component.count ?? placeholders.length, concreteCandidates.length),
      evidence: [candidate.label],
    } satisfies ParsedSyllabusComponent,
  }));

  if (concreteLeaves.length >= placeholders.length) {
    return concreteLeaves;
  }

  return [...concreteLeaves, ...placeholders.slice(concreteLeaves.length)];
}

function flattenLeaves(component: ParsedSyllabusComponent, parentLabel: string, prefix: string): LeafDescriptor[] {
  const children = component.children ?? [];
  if (children.length === 0) {
    return [{ id: prefix, parentLabel, component }];
  }

  return children.flatMap((child, index) => flattenLeaves(child, parentLabel, `${prefix}:${index}`));
}

function shouldExpandGenericChildPlaceholders(
  component: ParsedSyllabusComponent,
  children: readonly ParsedSyllabusComponent[],
) {
  return (
    children.length > 0 &&
    children.every((child) => isGenericSequentialPlaceholder(child)) &&
    (component.best_of != null || shouldExpandAggregateComponent(component))
  );
}

function shouldMaterializeCandidate(component: ParsedSyllabusComponent, candidate: GradeCandidate) {
  if (!isCompatibleKind(component.kind, candidate.kind, candidate.label)) return false;
  if (isAggregateCandidate(candidate.label) || isAdministrativeCandidate(candidate.label)) return false;
  if (candidate.kind === "extra" && component.kind !== "extra") return false;

  const score = scoreComponentCandidate(component, candidate);
  if (component.kind === "assignment" || component.kind === "project" || component.kind === "presentation") {
    return score.semantic >= 1;
  }

  return score.semantic >= 2 || (score.semantic >= 1 && (score.temporal > 0 || score.ordinal > 0));
}

function matchLeaves(
  leaves: LeafDescriptor[],
  moodleRows: MoodleGradeRow[],
  workbookRows: GradeCandidate[],
  moodleUnused: Set<string>,
  workbookUnused: Set<string>,
) {
  const rows = leaves.map((leaf) => buildInitialLeaf(leaf));

  matchExactRows(rows, moodleRows, moodleUnused, "moodle");
  matchExactRows(rows, workbookRows, workbookUnused, "xlsx");
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

function matchExactRows(
  rows: ReturnType<typeof buildInitialLeaf>[],
  candidates: GradeCandidate[],
  unusedIds: Set<string>,
  source: "moodle" | "xlsx",
) {
  const ranked = rows
    .filter((row) => row[source] == null)
    .flatMap((row) =>
      candidates
        .filter((candidate) => unusedIds.has(candidate.id))
        .filter((candidate) => isCompatibleKind(row.component.kind, candidate.kind, candidate.label))
        .map((candidate) => ({
          row,
          candidate,
          score: scoreComponentCandidate(row.component, candidate),
        })),
    )
    .filter(({ row, candidate, score }) => isExactEvidenceMatch(row.component, candidate, score))
    .sort(compareRankedMatches);

  for (const match of ranked) {
    if (match.row[source] != null || !unusedIds.has(match.candidate.id)) continue;
    match.row[source] = match.candidate;
    unusedIds.delete(match.candidate.id);
  }
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
        .filter((candidate) => unusedIds.has(candidate.id))
        .filter((candidate) => isCompatibleKind(row.component.kind, candidate.kind, candidate.label))
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
      .filter((candidate) => orderedRows.some((row) => allowsSequentialMatch(row.component, candidate)))
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
  let sequentialRanked = candidates
    .filter(
      (candidate) => unusedIds.has(candidate.id) && isCompatibleKind(component.kind, candidate.kind, candidate.label),
    )
    .map((candidate) => ({ candidate, score: scoreComponentCandidate(component, candidate) }))
    .filter(({ candidate, score }) => score.semantic >= 1 || allowsGenericSequentialFallback(component, candidate))
    .sort(compareRankedMatches);

  if (isGenericSequentialPlaceholder(component)) {
    const cleaner = sequentialRanked.filter(({ candidate }) => !isLowPrioritySequentialCandidate(candidate));
    if (cleaner.length > 0) {
      sequentialRanked = cleaner;
    }
    sequentialRanked = sequentialRanked.toSorted((left, right) =>
      compareGenericSequentialCandidates(component, left.candidate, right.candidate, left.score, right.score),
    );
  }

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
  workbookRows: GradeCandidate[],
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
  const inferredBestOf = inferImplicitBestOf(component, effectiveRows);
  const bestOf = component.best_of ?? inferredBestOf;
  const countedRows =
    bestOf != null && bestOf > 0
      ? effectiveRows
          .toSorted((left, right) => {
            const leftRaw = left.raw ?? Number.NEGATIVE_INFINITY;
            const rightRaw = right.raw ?? Number.NEGATIVE_INFINITY;
            if (rightRaw !== leftRaw) return rightRaw - leftRaw;
            if ((right.max ?? 0) !== (left.max ?? 0)) return (right.max ?? 0) - (left.max ?? 0);
            return left.label.localeCompare(right.label);
          })
          .slice(0, bestOf)
      : effectiveRows;
  const postedPoints = countedRows.reduce((sum, row) => sum + (row.raw ?? 0), 0);
  const candidateTotalPoints =
    component.max_points ?? (rows.reduce((sum, row) => sum + (row.maxPoints ?? row.effective?.max ?? 0), 0) || null);

  const totalPoints = candidateTotalPoints && candidateTotalPoints > 0 ? candidateTotalPoints : null;
  const effectivePercent = totalPoints && postedPoints >= 0 ? (postedPoints / totalPoints) * 100 : null;

  return { postedPoints: totalPoints ? postedPoints : null, totalPoints, effectivePercent };
}

function inferImplicitBestOf(component: ParsedSyllabusComponent, effectiveRows: readonly MatchedCandidateRef[]) {
  if (component.best_of != null || component.kind !== "quiz" || effectiveRows.length < 2) return null;

  const bonusQuizCount = effectiveRows.filter((row) => {
    const normalized = normalizeLabel(row.label);
    return /\bbonus\b/.test(normalized) && /\bquiz\b/.test(normalized);
  }).length;
  if (bonusQuizCount === 0) return null;

  const inferred = effectiveRows.length - bonusQuizCount;
  return inferred > 0 ? inferred : null;
}

function scoreComponentCandidate(component: ParsedSyllabusComponent, candidate: GradeCandidate): MatchScore {
  const componentLabels = getComponentLabelVariants(component);
  const candidateLabels = getCandidateLabelVariants(candidate);
  const candidateLabel = candidateLabels[0] ?? normalizeLabel(candidate.label);
  const componentTokenSets = componentLabels.map((label) => tokenize(label));
  const candidateTokenSets = candidateLabels.map((label) => tokenize(label));
  const overlap = Math.max(
    0,
    ...candidateTokenSets.map((candidateTokens) =>
      Math.max(
        0,
        ...componentTokenSets.map((tokens) => [...tokens].filter((token) => candidateTokens.has(token)).length),
      ),
    ),
  );
  const jaccard = Math.max(
    0,
    ...candidateTokenSets.map((candidateTokens) =>
      Math.max(0, ...componentTokenSets.map((tokens) => jaccardScore(tokens, candidateTokens))),
    ),
  );

  let semantic = 0;
  if (candidateLabels.some((label) => componentLabels.includes(label))) semantic = 3;
  else if (
    candidateLabels.some((label) =>
      componentLabels.some((componentVariant) => label.includes(componentVariant) || componentVariant.includes(label)),
    ) ||
    jaccard >= 0.74 ||
    componentLabels.some((componentVariant) => sharesAlias(componentVariant, candidateLabels))
  )
    semantic = 2;
  else if (overlap > 0 || isCompatibleKind(component.kind, candidate.kind, candidate.label)) semantic = 1;

  const maxCloseness = scoreMaxCloseness(component.max_points ?? null, candidate.max ?? null);
  if (
    semantic === 2 &&
    maxCloseness > 0 &&
    candidateLabels.some((label) =>
      componentLabels.some((componentVariant) => componentVariant.length >= 6 && label.includes(componentVariant)),
    )
  ) {
    semantic = 3;
  }

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
  else if (componentOrdinal != null && candidateOrdinal != null && componentOrdinal !== candidateOrdinal) ordinal = -1;

  return {
    semantic,
    temporal,
    ordinal,
    maxCloseness,
    fuzzy:
      jaccard +
      overlap * 0.15 +
      (candidate.posted ? 0.2 : 0) -
      (isAggregateTotal ? 0.6 : 0) -
      getCandidateNoisePenalty(candidateLabel) +
      Math.min(0, ordinal) * 0.8,
  };
}

function compareRankedMatches(
  left: { score: MatchScore; candidate: GradeCandidate },
  right: { score: MatchScore; candidate: GradeCandidate },
) {
  if (right.score.semantic !== left.score.semantic) return right.score.semantic - left.score.semantic;
  if (right.score.temporal !== left.score.temporal) return right.score.temporal - left.score.temporal;
  if (right.score.ordinal !== left.score.ordinal) return right.score.ordinal - left.score.ordinal;
  if (right.score.maxCloseness !== left.score.maxCloseness) return right.score.maxCloseness - left.score.maxCloseness;
  if (right.score.fuzzy !== left.score.fuzzy) return right.score.fuzzy - left.score.fuzzy;
  if ((right.candidate.max ?? 0) !== (left.candidate.max ?? 0))
    return (right.candidate.max ?? 0) - (left.candidate.max ?? 0);
  if (left.candidate.source !== right.candidate.source) return left.candidate.source === "moodle" ? -1 : 1;
  return left.candidate.label.localeCompare(right.candidate.label);
}

function isExactEvidenceMatch(component: ParsedSyllabusComponent, candidate: GradeCandidate, score: MatchScore) {
  const componentLabels = getComponentLabelVariants(component);
  const candidateLabels = getCandidateLabelVariants(candidate);
  const exact = candidateLabels.some((label) => componentLabels.includes(label));
  if (!exact) return false;
  return score.maxCloseness >= 0 || component.max_points == null || candidate.max == null;
}

function isCompatibleKind(componentKind: string | null | undefined, candidateKind: string, candidateLabel = "") {
  if (!componentKind || componentKind === "other") return true;
  if (componentKind === candidateKind) return true;

  const alternatives: Record<string, Set<string>> = {
    assignment: new Set(["assignment", "project", "presentation", "other"]),
    group_assignment: new Set(["group_assignment", "assignment", "project", "presentation"]),
    project: new Set(["project", "assignment", "group_assignment", "presentation", "other"]),
    presentation: new Set(["presentation", "assignment", "project", "group_assignment", "other"]),
    participation: new Set(["participation", "assignment", "other"]),
    quiz: new Set(["quiz", "midterm", "extra"]),
    midterm: new Set(["midterm", "quiz", "assignment", "other"]),
    final_exam: new Set(["final_exam", "quiz", "assignment", "other"]),
    extra: new Set(["extra", "quiz", "assignment", "other"]),
  };

  if (!(alternatives[componentKind]?.has(candidateKind) ?? false)) {
    return false;
  }

  const normalized = normalizeLabel(candidateLabel);
  if (componentKind === "midterm" && (candidateKind === "assignment" || candidateKind === "other")) {
    return /\b(midterm|zh|zarthelyi|dolgozat|test)\b/.test(normalized);
  }
  if (componentKind === "final_exam" && (candidateKind === "assignment" || candidateKind === "other")) {
    return /\b(final|exam|vizsga|dolgozat)\b/.test(normalized);
  }
  if (componentKind === "extra" && (candidateKind === "assignment" || candidateKind === "other")) {
    return /\b(extra|bonus|bonusz|kahoot|plusz pont|pluszpont)\b/.test(normalized);
  }

  return true;
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

function getCandidateLabelVariants(candidate: GradeCandidate) {
  const base = [normalizeLabel(candidate.label), stripMatchingNoise(normalizeLabel(candidate.label))];

  if (candidate.source === "xlsx") {
    base.push(...candidate.normalizedContextLabels);
  }

  const variants = new Set<string>();
  for (const label of base) {
    if (!label) continue;
    variants.add(label);
    for (const alias of expandAliases(label)) {
      variants.add(alias);
    }
  }

  return [...variants];
}

function getComponentLabelVariants(component: ParsedSyllabusComponent) {
  const base = [
    normalizeLabel(component.name),
    stripMatchingNoise(normalizeLabel(component.name)),
    ...extractEvidenceLabelVariants(component.evidence ?? []),
  ];

  const variants = new Set<string>();
  for (const label of base) {
    if (!label) continue;
    variants.add(label);
    variants.add(stripMatchingNoise(label));
    for (const alias of expandAliases(label)) {
      variants.add(alias);
    }
  }

  return [...variants];
}

function allowsSequentialMatch(component: ParsedSyllabusComponent, candidate: GradeCandidate) {
  if (!isCompatibleKind(component.kind, candidate.kind, candidate.label)) return false;

  const score = scoreComponentCandidate(component, candidate);
  if (score.semantic >= 1) return true;
  return allowsGenericSequentialFallback(component, candidate);
}

function allowsGenericSequentialFallback(component: ParsedSyllabusComponent, candidate: GradeCandidate) {
  return (
    isGenericSequentialPlaceholder(component) &&
    isCompatibleKind(component.kind, candidate.kind, candidate.label) &&
    !isAggregateCandidate(candidate.label) &&
    !isAdministrativeCandidate(candidate.label)
  );
}

function isGenericSequentialPlaceholder(component: ParsedSyllabusComponent) {
  if (component.index == null && component.count == null && !component.group) return false;

  const normalized = normalizeLabel(component.name);
  return (
    /^(assignment|homework|task|quiz|quizz|test|lecture test|lecture quiz|socrative|midterm|midterm exam|project|presentation)\s+\d+\b/.test(
      normalized,
    ) ||
    (!!component.group && normalized.endsWith(String(component.index ?? "")))
  );
}

function shouldExpandAggregateComponent(component: ParsedSyllabusComponent) {
  const normalized = normalizeLabel(component.name);
  if (
    !component.kind ||
    ["assignment", "group_assignment", "project", "presentation", "quiz", "midterm", "final_exam"].indexOf(
      component.kind,
    ) === -1
  ) {
    return false;
  }

  return (
    /\b(assignments|assignment|group assignment|semester group assignment|project work|seminar assignments|presentations|quizzes|tests|midterms|exam|final exam|teszt|tesztek|kvíz|kvizek|dolgozat|dolgozatok|vizsga|vizsgak|feladat|feladatok|hazi dolgozat|házi dolgozat|bonusz|plusz pont|pluszpont)\b/.test(
      normalized,
    ) && !isSpecificNumberedItemLabel(normalized)
  );
}

function shouldExpandAggregateCandidate(component: ParsedSyllabusComponent, candidate: GradeCandidate) {
  const score = scoreComponentCandidate(component, candidate);
  if (component.kind === "project") {
    return score.semantic >= 2;
  }
  if (component.kind === "final_exam") {
    return (
      score.semantic >= 2 ||
      (score.semantic >= 1 && /\b(final|exam|vizsga|part)\b/.test(normalizeLabel(candidate.label)))
    );
  }
  return score.semantic >= 1;
}

function compareAggregateCandidates(left: GradeCandidate, right: GradeCandidate) {
  if (left.source === right.source && left.rowIndex !== right.rowIndex) {
    return left.rowIndex - right.rowIndex;
  }
  const leftOrdinal = getOrdinalHint(left.label) ?? Number.MAX_SAFE_INTEGER;
  const rightOrdinal = getOrdinalHint(right.label) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrdinal !== rightOrdinal) return leftOrdinal - rightOrdinal;
  if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
  return left.label.localeCompare(right.label);
}

function isAggregateCandidate(label: string) {
  return /\b(total|overall|sum|course total)\b/i.test(label);
}

function isAdministrativeCandidate(label: string) {
  const normalized = normalizeLabel(label);
  if (/\b(attendance|sheet|announcement)\b/.test(normalized)) return true;
  if (/\b(lecke|lesson)\b/.test(normalized)) return true;
  return isGenericAdministrativeUploadLabel(normalized);
}

function getCandidateNoisePenalty(label: string) {
  const normalized = normalizeLabel(label);
  let penalty = 0;
  if (/\b(practice|retake|makeup|make up|make-up|review)\b/.test(normalized)) penalty += 0.8;
  if (/\b(attendance|sheet|announcement)\b/.test(normalized) || isGenericAdministrativeUploadLabel(normalized)) {
    penalty += 0.5;
  }
  return penalty;
}

function isLowPrioritySequentialCandidate(candidate: GradeCandidate) {
  const normalized = normalizeLabel(candidate.label);
  return (
    candidate.raw == null ||
    (typeof candidate.raw === "number" && candidate.raw < 0) ||
    /\b(practice|retake|makeup|make up|make-up|review|attendance|sheet|announcement)\b/.test(normalized) ||
    isGenericAdministrativeUploadLabel(normalized)
  );
}

function shouldSuppressUnassignedRow(
  row: MoodleGradeRow,
  allRows: readonly MoodleGradeRow[],
  unusedIds: ReadonlySet<string>,
) {
  const normalized = normalizeLabel(row.label);
  if (
    /\b(attendance|sheet|announcement|lecke|lesson)\b/.test(normalized) ||
    isGenericAdministrativeUploadLabel(normalized)
  ) {
    return true;
  }

  if (row.raw == null) {
    const family = getRowVariantFamily(row);
    if (family) {
      return allRows.some(
        (candidate) =>
          candidate.id !== row.id && !unusedIds.has(candidate.id) && getRowVariantFamily(candidate) === family,
      );
    }
  }

  return false;
}

function getRowVariantFamily(row: MoodleGradeRow) {
  const normalized = normalizeLabel(row.label);
  const stripped = normalized
    .replace(/\bfor absentees?\b/g, "")
    .replace(/\bgroup [a-z0-9]+\b/g, "")
    .replace(/\bquiz no\b/g, "quiz")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped && stripped !== "quiz") {
    return stripped;
  }

  if (/^group [a-z0-9]+$/.test(normalized) && row.sectionName) {
    return `${normalizeLabel(row.sectionName)}:${row.kind}`;
  }

  return null;
}

function isGenericAdministrativeUploadLabel(normalized: string) {
  if (/\bsubmission page\b/.test(normalized)) return true;
  if (!/\b(upload|submission page|feltolto felulet|feltoltesi felulet|beadas|beadasa|feltoltese)\b/.test(normalized)) {
    return false;
  }
  if (/^upload your home task$/.test(normalized)) return true;

  const tokenCount = normalized.split(" ").filter(Boolean).length;
  const hasSpecificSignal =
    /\b(task|deliverable|project|homework|exam|reflection|presentation|assignment|report|quiz|midterm|final)\b/.test(
      normalized,
    ) ||
    /\b(prezentacio|feladat|projekt|vizsga|beadando|dolgozat)\b/.test(normalized) ||
    /\b\d+\b/.test(normalized);

  return (tokenCount <= 4 && !hasSpecificSignal) || /\bfeltolto felulet\b|\bfeltoltesi felulet\b/.test(normalized);
}

function collapseVariantCandidates(candidates: readonly GradeCandidate[]) {
  const byFamily = new Map<string, GradeCandidate>();
  const passthrough: GradeCandidate[] = [];

  for (const candidate of candidates) {
    const family = getCandidateVariantFamily(candidate);
    if (!family) {
      passthrough.push(candidate);
      continue;
    }

    const previous = byFamily.get(family);
    if (!previous || compareVariantCandidates(candidate, previous) < 0) {
      byFamily.set(family, candidate);
    }
  }

  return [...passthrough, ...byFamily.values()].toSorted(compareAggregateCandidates);
}

function getCandidateVariantFamily(candidate: GradeCandidate) {
  if (candidate.source !== "moodle") return null;

  const normalized = normalizeLabel(candidate.label);
  const stripped = normalized
    .replace(/\bfor absentees?\b/g, "")
    .replace(/\bgroup [a-z0-9]+\b/g, "")
    .replace(/\bquiz no\b/g, "quiz")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped && stripped !== "quiz") {
    return `${candidate.kind}:${stripped}`;
  }

  if (/^group [a-z0-9]+$/.test(normalized) && candidate.sectionName) {
    return `${candidate.kind}:${normalizeLabel(candidate.sectionName)}`;
  }

  return null;
}

function compareVariantCandidates(left: GradeCandidate, right: GradeCandidate) {
  if (left.posted !== right.posted) return left.posted ? -1 : 1;
  const leftRaw = left.raw ?? Number.NEGATIVE_INFINITY;
  const rightRaw = right.raw ?? Number.NEGATIVE_INFINITY;
  if (rightRaw !== leftRaw) return rightRaw - leftRaw;
  if (left.source === "moodle" && right.source === "moodle" && left.rowIndex !== right.rowIndex) {
    return left.rowIndex - right.rowIndex;
  }
  return left.label.localeCompare(right.label);
}

function compareGenericSequentialCandidates(
  component: ParsedSyllabusComponent,
  left: GradeCandidate,
  right: GradeCandidate,
  leftScore: MatchScore,
  rightScore: MatchScore,
) {
  const leftLow = isLowPrioritySequentialCandidate(left);
  const rightLow = isLowPrioritySequentialCandidate(right);
  if (leftLow !== rightLow) return leftLow ? 1 : -1;

  const componentOrdinal = component.index ?? getOrdinalHint(component.name);
  const leftOrdinal = getOrdinalHint(left.label);
  const rightOrdinal = getOrdinalHint(right.label);
  if (component.kind === "midterm" || component.kind === "quiz" || component.kind === "final_exam") {
    const leftDistance = ordinalDistance(componentOrdinal, leftOrdinal);
    const rightDistance = ordinalDistance(componentOrdinal, rightOrdinal);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  }

  if (isAssignmentLikeSequential(component)) {
    const leftRaw = left.raw ?? Number.NEGATIVE_INFINITY;
    const rightRaw = right.raw ?? Number.NEGATIVE_INFINITY;
    if (rightRaw !== leftRaw) return rightRaw - leftRaw;
  }

  if (rightScore.fuzzy !== leftScore.fuzzy) return rightScore.fuzzy - leftScore.fuzzy;
  if ((leftOrdinal ?? Number.MAX_SAFE_INTEGER) !== (rightOrdinal ?? Number.MAX_SAFE_INTEGER)) {
    return (leftOrdinal ?? Number.MAX_SAFE_INTEGER) - (rightOrdinal ?? Number.MAX_SAFE_INTEGER);
  }

  return left.label.localeCompare(right.label);
}

function ordinalDistance(componentOrdinal: number | null, candidateOrdinal: number | null) {
  if (componentOrdinal == null && candidateOrdinal == null) return 0;
  if (componentOrdinal == null || candidateOrdinal == null) return 10;
  return Math.abs(componentOrdinal - candidateOrdinal);
}

function isAssignmentLikeSequential(component: ParsedSyllabusComponent) {
  return ["assignment", "project", "presentation"].includes(component.kind || "");
}

function sharesAlias(componentLabel: string, candidateLabels: readonly string[]) {
  const componentAliases = expandAliases(componentLabel);
  return candidateLabels.some((candidateLabel) => componentAliases.some((alias) => candidateLabel.includes(alias)));
}

function expandAliases(label: string) {
  const variants = new Set<string>([label]);
  variants.add(stripMatchingNoise(label));
  if (/\bbonusz\b/.test(label)) {
    variants.add(label.replace(/\bbonusz\b/g, "bonus"));
  }
  if (/\bbonus\b|\bbonusz\b/.test(label)) {
    variants.add(
      label
        .replace(/\bbonus\b|\bbonusz\b/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  if (/\bdolgozatok\b/.test(label)) {
    variants.add(label.replace(/\bdolgozatok\b/g, "dolgozat"));
  }

  if (/\bquizz?\b/.test(label)) {
    variants.add(label.replace(/\bquizz?\b/g, "quiz"));
    variants.add(label.replace(/\bquizz?\b/g, "test"));
    variants.add(label.replace(/\bquizz?\b/g, "socrative"));
  }
  if (/\bquiz\b/.test(label)) {
    variants.add(label.replace(/\bquiz\b/g, "quizz"));
    variants.add(label.replace(/\bquiz\b/g, "test"));
    variants.add(label.replace(/\bquiz\b/g, "socrative"));
  }
  if (/\bmidterm\b/.test(label)) {
    variants.add(label.replace(/\bmidterm\b/g, "midterm exam"));
  }
  if (/\bmidterm exam\b/.test(label)) {
    variants.add("zh");
    variants.add("zh eredmeny");
  }
  if (/\bhomework\b/.test(label)) {
    variants.add(label.replace(/\bhomework\b/g, "assignment"));
    variants.add(label.replace(/\bhomework\b/g, "task"));
  }
  if (/\bassignment\b/.test(label)) {
    variants.add(label.replace(/\bassignment\b/g, "homework"));
    variants.add(label.replace(/\bassignment\b/g, "task"));
  }
  if (/\bextra credit\b/.test(label) || /\bbonus\b/.test(label)) {
    variants.add(label.replace(/\bextra credit\b/g, "bonus"));
    variants.add(label.replace(/\bextra credit\b/g, "extra point"));
    variants.add(label.replace(/\bbonus\b/g, "extra"));
    variants.add(label.replace(/\bbonus\b/g, "kahoot"));
    variants.add(label.replace(/\bbonus\b/g, "extra point"));
  }
  if (/\bextra points?\b/.test(label)) {
    variants.add("pluszpontok");
    variants.add("atvitt pluszpontok");
  }
  if (/\bzarthelyi dolgozat\b/.test(label)) {
    variants.add(label.replace(/\bzarthelyi dolgozat\b/g, "zh"));
    variants.add(label.replace(/\bzarthelyi dolgozat\b/g, "zh eredmeny"));
  }
  if (/\bvizsga\b/.test(label) || /\bfinal exam\b/.test(label)) {
    variants.add("vizsgajegy");
    variants.add("vizsgaeredmeny");
    variants.add(label.replace(/\bvizsga\b/g, "vizsgajegy"));
    variants.add(label.replace(/\bvizsga\b/g, "vizsgaeredmeny"));
    variants.add(label.replace(/\bfinal exam\b/g, "vizsgajegy"));
  }
  if (/pluszpont/.test(label)) {
    variants.add(label.replace(/pluszpont/g, "bonus"));
    variants.add(label.replace(/pluszpont/g, "extra point"));
  }

  return [...variants];
}

function scoreMaxCloseness(componentMax: number | null, candidateMax: number | null) {
  if (componentMax == null || candidateMax == null) return 0;
  if (componentMax === candidateMax) return 3;

  const ratio = Math.max(componentMax, candidateMax) / Math.max(1, Math.min(componentMax, candidateMax));
  if (ratio <= 1.15) return 2;
  if (ratio <= 1.5) return 1;
  if (ratio >= 5) return -2;
  if (ratio >= 3) return -1;
  return 0;
}

function stripMatchingNoise(label: string) {
  return label
    .replace(/\bmilestone\s+\d+\s*-\s*/g, "")
    .replace(/\boral presentation\b/g, "group presentation")
    .replace(/\btopic description\b/g, "")
    .replace(/\bnew deadline\b.*$/g, "")
    .replace(/\bdeadline\b.*$/g, "")
    .replace(/\bsubmission of your\b/g, "")
    .replace(/\bsubmission\b/g, "")
    .replace(/\(\s*(?:deadline|new deadline)[^)]+\)/g, "")
    .replace(/\(\s*topic description\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSpecificNumberedItemLabel(normalized: string) {
  if (!/\b\d+\b/.test(normalized)) return false;
  if (
    /^(?:\d+)\s+(assignments|quizzes|tests|midterms|presentations|exams|tesztek|kvízek|kvizek|dolgozatok|vizsgak|feladatok)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  return /\b(assignment|homework|task|quiz|quizz|test|socrative|midterm|project|presentation|exam|teszt|kvíz|kviz|dolgozat|vizsga|feladat)\b/.test(
    normalized,
  );
}

function extractEvidenceLabelVariants(evidence: readonly string[]) {
  return evidence.flatMap((entry) => {
    const normalized = normalizeLabel(entry);
    if (!normalized || normalized.length > 80) return [];
    if (/\b(pdf|docx|xlsx|moodle rows?|document|page)\b/.test(normalized)) return [];
    if (normalized.split(" ").length > 10) return [];
    return [normalized];
  });
}
