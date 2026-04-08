import { cleanMoodleHtml } from "./utils";

export function normalizeGradeText(value: string | null | undefined) {
  return cleanMoodleHtml(value || "")
    .replace(/\bGrade analysis\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanGradeField(value: string | null | undefined): string | undefined {
  const cleaned = normalizeGradeText(value);
  if (isPlaceholderGradeValue(cleaned)) return undefined;
  return cleaned;
}

export function isPlaceholderGradeValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === "-" || trimmed === "–" || trimmed === "—";
}
