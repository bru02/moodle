// @ts-expect-error no types
import domino from "@mixmark-io/domino";
import { decode } from "html-entities";

import type { CoreGradesGetUserGradesTableWSResponse, CoreGradesTableRow } from "./grade-types";

type GradeTreeNode = {
  label: string;
  level: number;
  kind: "category" | "item";
  grade?: string;
  range?: string;
  percentage?: string;
  moduleId?: number;
  children: GradeTreeNode[];
};

export function renderCourseGradeHierarchyMarkdown(params: {
  siteUrl: string;
  generatedAt?: Date;
  courseTitle: string;
  courseId: number;
  table: CoreGradesGetUserGradesTableWSResponse;
}): string {
  const generatedAt = (params.generatedAt ?? new Date()).toISOString();
  const rows = params.table.tables?.[0]?.tabledata ?? [];
  const tree = buildGradeTree(rows, params.siteUrl);

  const lines: string[] = [
    `# ${params.courseTitle} Grades`,
    "",
    `- Course ID: ${params.courseId}`,
    `- Site: ${params.siteUrl}`,
    `- Generated: ${generatedAt}`,
    "",
  ];

  if (tree.length === 0) {
    lines.push("No grade rows found.");
    lines.push("");
    return lines.join("\n");
  }

  for (const node of tree) {
    renderNode(lines, node, 0);
  }

  lines.push("");
  return lines.join("\n");
}

function buildGradeTree(rows: readonly CoreGradesTableRow[], siteUrl: string): GradeTreeNode[] {
  const roots: GradeTreeNode[] = [];
  const stack: GradeTreeNode[] = [];

  for (const row of rows) {
    if (!row.itemname?.content) continue;

    const itemClass = row.itemname.class || "";
    const level = parseLevel(itemClass);
    const kind: GradeTreeNode["kind"] = /\bcategory\b/.test(itemClass) ? "category" : "item";
    const label = extractRowLabel(row, kind);
    if (!label) continue;

    const node: GradeTreeNode = {
      label,
      level,
      kind,
      grade: cleanField(row.grade?.content),
      range: cleanField(row.range?.content),
      percentage: cleanField(row.percentage?.content),
      moduleId: extractModuleId(row, siteUrl),
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1]!.level >= node.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    if (node.kind === "category" || node.children.length === 0) {
      stack.push(node);
    }
  }

  return roots;
}

function parseLevel(itemClass: string) {
  const match = itemClass.match(/\blevel(\d+)\b/);
  return match ? Number(match[1]) : 1;
}

function extractRowLabel(row: CoreGradesTableRow, kind: GradeTreeNode["kind"]) {
  const doc = domino.createDocument(row.itemname?.content || "");

  if (kind === "category") {
    const direct = doc.querySelector(".category-content > span:last-child")?.textContent;
    const text = normalizeText(direct);
    if (text) return text;
  }

  const headerText = doc.querySelector(".gradeitemheader")?.textContent;
  const header = normalizeText(headerText);
  if (header) return header;

  return normalizeText(doc.body?.textContent || "");
}

function normalizeText(value: string | null | undefined) {
  const html = value || "";
  return decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanField(value: string | undefined) {
  const cleaned = normalizeText(value)
    .replace(/\bGrade analysis\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned === "-" || cleaned === "–" || cleaned === "—") return undefined;
  return cleaned;
}

function extractModuleId(row: CoreGradesTableRow, siteUrl: string) {
  const doc = domino.createDocument(row.itemname?.content || "");
  const href = doc.querySelector(".gradeitemheader")?.getAttribute("href");
  if (!href) return undefined;

  try {
    const url = new URL(href, siteUrl);
    const moduleId = Number(url.searchParams.get("id"));
    return Number.isFinite(moduleId) ? moduleId : undefined;
  } catch {
    return undefined;
  }
}

function renderNode(lines: string[], node: GradeTreeNode, depth: number) {
  const indent = "  ".repeat(depth);
  const meta: string[] = [];

  if (node.kind === "item") {
    if (node.grade && node.range) meta.push(`${node.grade} / ${node.range.split("–")[1]?.trim() ?? node.range}`);
    else if (node.grade) meta.push(node.grade);
    if (node.percentage) meta.push(node.percentage);
    if (node.moduleId) meta.push(`module ${node.moduleId}`);
  }

  const suffix = meta.length > 0 ? ` — ${meta.join(" • ")}` : "";
  lines.push(`${indent}- ${node.label}${suffix}`);

  for (const child of node.children) {
    renderNode(lines, child, depth + 1);
  }
}
