import { Module } from "../types";
import { normalizeLabel } from "./text";

export const SYLLABUS_EXCLUDED_MODNAMES = new Set(["quiz", "assign", "choice", "chat"]);
const SYLLABUS_PREFERRED_MODNAMES = ["resource", "page", "book", "folder"] as const;
const STRONG_SYLLABUS_TERMS = [
  "syllabus",
  "tantargyi",
  "tantárgyi",
  "tantargyleiras",
  "tantárgyleírás",
  "tematika",
  "requirements",
  "requirement",
  "course guide",
  "assessment",
  "grading",
  "követel",
  "kovetel",
];
const WEAK_SYLLABUS_TERMS = [
  "introduction",
  "intro",
  "overview",
  "guide",
  "description",
  "course information",
  "course info",
];

export function getFileSortScore(file: { filename?: string; mimetype?: string }) {
  const filename = (file.filename || "").toLowerCase();
  const mimetype = (file.mimetype || "").toLowerCase();
  let score = 0;

  for (const term of STRONG_SYLLABUS_TERMS) {
    if (filename.includes(term)) score += 12;
  }
  for (const term of WEAK_SYLLABUS_TERMS) {
    if (filename.includes(term)) score += 4;
  }
  if (filename.endsWith(".pdf")) score += 6;
  if (filename.endsWith(".docx")) score += 4;
  if (filename.endsWith(".txt") || filename.endsWith(".html") || filename.endsWith(".md")) score += 3;
  if (mimetype.includes("pdf")) score += 2;
  return score;
}

export function getSyllabusArtifactScore(
  module: Module,
  sectionName: string,
  file?: { filename?: string; mimetype?: string },
) {
  if (SYLLABUS_EXCLUDED_MODNAMES.has(module.modname)) {
    return { score: -1000, reasons: ["excluded-modname"] };
  }

  const titleBlob = normalizeLabel(module.name || "");
  const fileBlob = normalizeLabel(file?.filename || "");
  const parts = [sectionName, module.name, stripHTML(module.description || ""), file?.filename].filter(Boolean);
  const blob = normalizeLabel(parts.join(" "));
  const reasons: string[] = [];
  let score = 0;

  const preferredIndex = SYLLABUS_PREFERRED_MODNAMES.indexOf(
    module.modname as (typeof SYLLABUS_PREFERRED_MODNAMES)[number],
  );
  if (preferredIndex >= 0) {
    score += 40 - preferredIndex * 5;
    reasons.push(`preferred:${module.modname}`);
  }

  for (const term of STRONG_SYLLABUS_TERMS) {
    const normalizedTerm = normalizeLabel(term);
    if (blob.includes(normalizedTerm)) {
      score += 10;
      reasons.push(term);
    }
    if (titleBlob.includes(normalizedTerm)) {
      score += 20;
      reasons.push(`title:${term}`);
    } else if (fileBlob.includes(normalizedTerm)) {
      score += 16;
      reasons.push(`file:${term}`);
    }
  }

  for (const term of WEAK_SYLLABUS_TERMS) {
    if (blob.includes(normalizeLabel(term))) {
      score += 4;
      reasons.push(`weak:${term}`);
    }
  }

  if (file) {
    score += getFileSortScore(file);
  }

  if (blob.includes("exam") || blob.includes("quiz")) score -= 8;
  if (blob.includes("submission") || blob.includes("assignment")) score -= 6;
  if (blob.includes("forum") || blob.includes("announcement")) score -= 4;

  return { score, reasons };
}

function stripHTML(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
