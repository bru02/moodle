import { toGradeRowSummaries } from "./grade-core";
import type { CoreGradesGetUserGradesTableWSResponse } from "./grade-types";

export type GradeViewMarkdownInput = {
  credentialLabel: string;
  siteUrl: string;
  generatedAt?: Date;
  tables: readonly CoreGradesGetUserGradesTableWSResponse[];
};

export function renderGradeViewMarkdown(input: GradeViewMarkdownInput): string {
  const lines: string[] = ["# Course Grades"];

  for (const courseData of input.tables) {
    const table = courseData.tables?.[0];
    const courseLabel = table?.courseid
      ? `Course ${table.courseid}`
      : "Unknown Course";
    lines.push(`## ${courseLabel}`);
    lines.push("");
    lines.push("| Item | Grade | Range | Percentage | Module ID |");
    lines.push("| --- | --- | --- | --- | --- |");

    const rows = toGradeRowSummaries(table?.tabledata, {
      siteUrl: input.siteUrl,
    });
    if (rows.length === 0) {
      lines.push("| No grade rows | - | - | - | - |");
    } else {
      for (const row of rows) {
        lines.push(
          `| ${escapeCell(row.label)} | ${escapeCell(row.grade)} | ${escapeCell(row.range)} | ${escapeCell(row.percentage)} | ${row.moduleId ?? "-"} |`,
        );
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

function escapeCell(value: string | undefined) {
  if (!value) return "-";
  return value.replace(/\|/g, "\\|");
}
