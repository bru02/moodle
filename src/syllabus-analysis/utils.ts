import { createHash } from "crypto";
// @ts-expect-error domino types are not module-friendly here
import domino from "@mixmark-io/domino";
import { stripHTML } from "../helpers";
import { getFilePath, pdfify } from "../helpers/files";
import { preferences } from "../helpers/preferences";
import { CoreWSExternalFile, Module } from "../types";
import { SimpleCourse } from "../types/simple-course";
import { normalizeLabel } from "./text";
export { getFileSortScore, getSyllabusArtifactScore, SYLLABUS_EXCLUDED_MODNAMES } from "./scoring";
const WORKBOOK_KEYWORDS = ["score", "scores", "grade", "grades", "point", "points", "result", "results", "jegy"];

export function buildInlineModuleText(module: Module, sectionName?: string) {
  const parts = [sectionName, module.name, stripHTML(module.description || "")];

  if (module.modname === "book") {
    const tocContent = module.contents?.find((content) => content.filename === "structure")?.content;
    if (tocContent) {
      try {
        parts.push(JSON.stringify(JSON.parse(tocContent)));
      } catch {
        parts.push(tocContent);
      }
    }
  }

  for (const content of module.contents ?? []) {
    if (content.type === "content" && content.content) {
      parts.push(stripHTML(content.content));
    }
  }

  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function getSyncedLocalPath(
  file: Pick<CoreWSExternalFile, "filename" | "mimetype">,
  module: Module,
  course: SimpleCourse,
) {
  const path = getFilePath(file, module, course);
  if (file.mimetype && canUseConvertedPdf(file.mimetype)) {
    return pdfify(path);
  }
  return path;
}

export function canUseConvertedPdf(mimetype?: string) {
  return mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function classifyGradeKind(name: string, module = "") {
  const value = normalizeLabel(`${name} ${module}`);
  if (/bonus|extra|kahoot/.test(value)) return "extra";
  if (/attendance|jelenleti/.test(value)) return "attendance";
  if (/participation/.test(value)) return "participation";
  if (/comprehensive/.test(value)) return "comprehensive_exam";
  if (/final|endterm|exam part/.test(value)) return "final_exam";
  if (/midterm/.test(value)) return "midterm";
  if (/presentation|prezent/.test(value)) return "presentation";
  if (/project/.test(value)) return "project";
  if (/group/.test(value)) return "group_assignment";
  if (/quiz|test/.test(value)) return "quiz";
  if (/assign|homework|task|submission|milestone/.test(value)) return "assignment";
  if (module === "quiz") return "quiz";
  if (module === "assign") return "assignment";
  return "other";
}

export function parseNumber(value: string | undefined) {
  const cleaned = (value || "").replace(",", ".");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parseGradeRange(rowGrade: string, rowRange: string) {
  const raw = parseNumber(rowGrade);
  const parts = rowRange.split(/[–-]/).map((part) => parseNumber(part.trim()));
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
    label: header?.textContent?.trim() || stripHTML(html),
    href: header?.getAttribute("href") || undefined,
  };
}

export function getModuleIdFromGradeHref(href: string | undefined) {
  if (!href) return undefined;
  try {
    const url = new URL(href, preferences.site_url);
    const moduleId = Number(url.searchParams.get("id"));
    return Number.isFinite(moduleId) ? moduleId : undefined;
  } catch {
    return undefined;
  }
}

export function getModuleTypeFromGradeHref(href: string | undefined) {
  if (!href) return "";
  try {
    const url = new URL(href, preferences.site_url);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[1] : "";
  } catch {
    return "";
  }
}

export function sha1(payload: unknown) {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

export function isWorkbookCandidate(module: Module, file: Pick<CoreWSExternalFile, "filename">) {
  const blob = normalizeLabel(`${module.name} ${file.filename || ""}`);
  return blob.includes("xlsx") || WORKBOOK_KEYWORDS.some((keyword) => blob.includes(keyword));
}
