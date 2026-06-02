import { stripHTML, toGradeRowSummaries } from "@moodle/core";
import type {
  CourseAnalysisBundle,
  CourseEvidenceItem,
  CourseGradesSyncResult,
} from "./types";

const SYLLABUS_PATTERNS = [
  /\bsyllabus\b/i,
  /\bkövetelmény(?:ek)?\b/i,
  /\btematika\b/i,
  /\bértékelés\b/i,
  /\baláírás\b/i,
  /\bexam requirements?\b/i,
  /\bgrading\b/i,
];

export function buildAnalysisBundle(input: {
  sync: CourseGradesSyncResult;
  neptuneCode?: string;
}): CourseAnalysisBundle {
  const evidence: CourseEvidenceItem[] = [];

  for (const syncedCourse of input.sync.courses) {
    for (const section of syncedCourse.contents) {
      addTextEvidence({
        evidence,
        courseId: syncedCourse.course.id,
        courseName: syncedCourse.course.displayname,
        sectionName: section.name,
        source: `course:${syncedCourse.course.id}:section:${section.id}`,
        text: section.summary,
        neptuneCode: input.neptuneCode,
      });

      for (const module of section.modules) {
        addTextEvidence({
          evidence,
          courseId: syncedCourse.course.id,
          courseName: syncedCourse.course.displayname,
          moduleId: module.id,
          moduleName: module.name,
          sectionName: section.name,
          source: module.url ?? `course:${syncedCourse.course.id}:module:${module.id}`,
          text: [module.name, module.description].filter(Boolean).join("\n\n"),
          neptuneCode: input.neptuneCode,
        });
      }
    }

    const rows = syncedCourse.grades?.tables?.[0]?.tabledata;
    if (rows) {
      for (const row of toGradeRowSummaries(rows, { siteUrl: input.sync.siteOrigin })) {
        evidence.push({
          kind: "grade",
          courseId: syncedCourse.course.id,
          courseName: syncedCourse.course.displayname,
          moduleId: row.moduleId,
          moduleName: row.label,
          source: `course:${syncedCourse.course.id}:grades`,
          text: [
            row.label,
            row.grade ? `Grade: ${row.grade}` : undefined,
            row.range ? `Range: ${row.range}` : undefined,
            row.percentage ? `Percentage: ${row.percentage}` : undefined,
          ]
            .filter(Boolean)
            .join("\n"),
          score: 40,
        });
      }
    }
  }

  evidence.sort((left, right) => right.score - left.score);

  return {
    generatedAt: new Date().toISOString(),
    neptuneCode: input.neptuneCode,
    evidence,
    llmInput: renderLlmInput(evidence),
  };
}

function addTextEvidence(input: {
  evidence: CourseEvidenceItem[];
  courseId: number;
  courseName: string;
  moduleId?: number;
  moduleName?: string;
  sectionName?: string;
  source: string;
  text?: string;
  neptuneCode?: string;
}) {
  const text = cleanText(input.text);
  if (!text) return;

  const syllabusScore = scoreSyllabus(text);
  const mentionsNeptune = Boolean(
    input.neptuneCode &&
      text.toLowerCase().includes(input.neptuneCode.toLowerCase()),
  );

  if (syllabusScore > 0) {
    input.evidence.push({
      kind: "syllabus",
      courseId: input.courseId,
      courseName: input.courseName,
      moduleId: input.moduleId,
      moduleName: input.moduleName,
      sectionName: input.sectionName,
      source: input.source,
      text,
      score: syllabusScore,
    });
  }

  if (mentionsNeptune) {
    input.evidence.push({
      kind: "neptune-code",
      courseId: input.courseId,
      courseName: input.courseName,
      moduleId: input.moduleId,
      moduleName: input.moduleName,
      sectionName: input.sectionName,
      source: input.source,
      text,
      score: 100,
    });
  }
}

function cleanText(text?: string) {
  return stripHTML(text ?? "").replace(/\s+/g, " ").trim();
}

function scoreSyllabus(text: string) {
  let score = 0;
  for (const pattern of SYLLABUS_PATTERNS) {
    if (pattern.test(text)) score += 25;
  }
  return score;
}

function renderLlmInput(evidence: readonly CourseEvidenceItem[]) {
  return evidence
    .map((item, index) =>
      [
        `# Evidence ${index + 1}: ${item.kind}`,
        `Course: ${item.courseName} (${item.courseId})`,
        item.sectionName ? `Section: ${item.sectionName}` : undefined,
        item.moduleName ? `Module: ${item.moduleName}` : undefined,
        `Source: ${item.source}`,
        "",
        item.text,
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n"),
    )
    .join("\n\n---\n\n");
}
