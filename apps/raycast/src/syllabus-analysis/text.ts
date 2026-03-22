const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "week",
  "course",
  "assignment",
  "assessment",
]);

export function asciiFold(value: string) {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
}

export function normalizeLabel(value: string) {
  return asciiFold(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string) {
  return new Set(
    normalizeLabel(value)
      .split(" ")
      .filter((token) => token && !STOP_WORDS.has(token)),
  );
}

export function getWeekHint(text: string) {
  const match = normalizeLabel(text).match(/\bweek (\d{1,2})\b/);
  return match?.[1] ?? null;
}

export function getOrdinalHint(text: string) {
  const normalized = normalizeLabel(text);
  const ordinal = normalized.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  if (ordinal) return Number(ordinal[1]);

  const direct = normalized.match(/\b(\d{1,2})\b/);
  if (direct) return Number(direct[1]);

  const romans = [
    [" i ", 1],
    [" ii ", 2],
    [" iii ", 3],
    [" iv ", 4],
    [" v ", 5],
    [" vi ", 6],
  ] as const;
  const padded = ` ${normalized} `;
  for (const [token, value] of romans) {
    if (padded.includes(token)) return value;
  }
  return null;
}

export function jaccardScore(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}
