// @ts-expect-error domino types are not module-friendly here
import domino from "@mixmark-io/domino";
import { decode } from "html-entities";

import { asciiFold, normalizeLabel } from "./text";

export function stripHtmlText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyGradeKind(name: string, module = "") {
  const raw = asciiFold(`${name} ${module}`).toLowerCase();
  const value = normalizeLabel(`${name} ${module}`);
  const nameValue = normalizeLabel(name);
  if (/\bbonus\b/.test(value) && /\b(quiz|quizz|test|socrative)\b/.test(value)) return "quiz";
  if (/pluszpont|plusz pont/.test(value)) return "extra";
  if (/bonus|extra|kahoot/.test(value) || /\+\s*\d+(?:[.,]\d+)?\s*points?/.test(raw)) return "extra";
  if (/attendance|jelenleti/.test(value)) return "attendance";
  if (/szeminariumi pont/.test(value)) return "participation";
  if (/szeminariumi jegy|seminar grade/.test(value)) return "participation";
  if (/\bzh\b|zarthelyi/.test(value)) return "midterm";
  if (/vizsgajegy|vizsgaeredmeny|vizsga eredmeny/.test(value)) return "final_exam";
  if (/participation|class activity/.test(value)) return "participation";
  if (/comprehensive/.test(value)) return "comprehensive_exam";
  if (/final|endterm|exam part/.test(value)) return "final_exam";
  if (/\bmid ?terms?\b/.test(value)) return "midterm";
  if (module === "quiz" && /^group [a-z0-9]+$/.test(nameValue)) return "quiz";
  if (/presentation|prezent/.test(value)) return "presentation";
  if (/project/.test(value)) return "project";
  if (/group/.test(value)) return "group_assignment";
  if (/assign|homework|task|submission|milestone|\bhw(?:\b|\d)/.test(value)) return "assignment";
  if (/quiz|quizz|test|socrative/.test(value)) return "quiz";
  if (module === "quiz") return "quiz";
  if (module === "assign") return "assignment";
  return "other";
}

export function inferLabelPointLimit(label: string) {
  const raw = asciiFold(label).toLowerCase();
  const normalized = normalizeLabel(label);
  const matches = [
    normalized.match(/\b(?:max(?:imum)?|up to)\s*(\d+(?:[.,]\d+)?)\s*points?\b/i),
    normalized.match(/\(\s*(\d+(?:[.,]\d+)?)\s*extra points?\s*\)/i),
    raw.match(/\(\s*\+\s*(\d+(?:[.,]\d+)?)\s*points?\s*\)/i),
  ]
    .map((match) => match?.[1] ?? null)
    .filter((value): value is string => value != null)
    .map((value) => Number(value.replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);

  return matches[0] ?? null;
}

export function parseNumber(value: string | number | undefined | null) {
  const cleaned = String(value ?? "").replace(",", ".");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parseGradeRange(rowGrade: string, rowRange: string) {
  const decodedGrade = decode(stripHtmlText(rowGrade || ""));
  const decodedRange = decode(stripHtmlText(rowRange || ""));
  const raw = parseNumber(decodedGrade);
  const parts = decodedRange.split(/[–-]/).map((part) => parseNumber(part.trim()));
  const max = parts[1] ?? null;
  return {
    raw,
    max,
    pct: raw != null && max ? (raw / max) * 100 : null,
    posted: raw != null && max != null,
  };
}

export function extractGradeRowLabel(html: string) {
  const doc = domino.createDocument(html || "");
  const header = doc.querySelector(".gradeitemheader");
  return {
    label: header?.textContent?.trim() || stripHtmlText(html),
    href: header?.getAttribute("href") || undefined,
  };
}

export function getModuleIdFromGradeHref(href: string | undefined, siteUrl?: string) {
  if (!href || !siteUrl) return undefined;
  try {
    const url = new URL(href, siteUrl);
    const moduleId = Number(url.searchParams.get("id"));
    return Number.isFinite(moduleId) ? moduleId : undefined;
  } catch {
    return undefined;
  }
}

export function getModuleTypeFromGradeHref(href: string | undefined, siteUrl?: string) {
  if (!href || !siteUrl) return "";
  try {
    const url = new URL(href, siteUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[1] : "";
  } catch {
    return "";
  }
}
