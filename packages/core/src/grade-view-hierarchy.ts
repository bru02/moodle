import { parseGradeRows } from "./grade-row-parser";
import type {
  CoreGradesGetUserGradesTableWSResponse,
  CoreGradesTableRow,
} from "./grade-types";

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

function buildGradeTree(
  rows: readonly CoreGradesTableRow[],
  siteUrl: string,
): GradeTreeNode[] {
  const roots: GradeTreeNode[] = [];
  const stack: GradeTreeNode[] = [];

  for (const row of parseGradeRows(rows, { siteUrl })) {
    const node: GradeTreeNode = {
      label: row.label,
      level: row.level,
      kind: row.kind,
      grade: row.grade,
      range: row.range,
      percentage: row.percentage,
      moduleId: row.moduleId,
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

function renderNode(lines: string[], node: GradeTreeNode, depth: number) {
  const indent = "  ".repeat(depth);
  const meta: string[] = [];

  if (node.kind === "item") {
    if (node.grade && node.range)
      meta.push(
        `${node.grade} / ${node.range.split("–")[1]?.trim() ?? node.range}`,
      );
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
