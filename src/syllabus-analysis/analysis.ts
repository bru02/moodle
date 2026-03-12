import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { FileState, GoogleGenAI } from "@google/genai";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { mkdir, stat, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { z } from "zod";
import { ScopedRenderedSection } from "../course-content";
import { CourseScope } from "../course-scope";
import { preferences } from "../helpers/preferences";
import { CoreGradesGetUserGradesTableWSResponse } from "../types/grade";
import { hashAnalysisInputs } from "./logic";
import { matchSyllabusToGrades } from "./matching";
import { selectSyllabusArtifact } from "./selector";
import { normalizeLabel } from "./text";
import {
  MoodleGradeRow,
  ParsedSyllabusDocument,
  SelectedSyllabusArtifact,
  SyllabusAnalysisPayload,
  WorkbookFingerprintEntry,
} from "./types";
import {
  classifyGradeKind,
  extractGradeRowLabel,
  getModuleIdFromGradeHref,
  getModuleTypeFromGradeHref,
  parseGradeRange,
  sha1,
} from "./utils";
import { collectWorkbookFingerprints, parseWorkbookEntries } from "./workbook";

const uploadedPdfUriByFingerprint = new Map<string, Promise<string | null>>();

const syllabusComponentSchema: z.ZodType<ParsedSyllabusDocument["components"][number]> = z.object({
  name: z.string(),
  kind: z
    .string()
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
  max_points: z.number().nullable().optional(),
  group: z.string().nullable().optional(),
  index: z.number().int().nullable().optional(),
  count: z.number().int().nullable().optional(),
  deadline_hint: z.string().nullable().optional(),
  week_hint: z.string().nullable().optional(),
  evidence: z.array(z.string()).default([]),
  children: z
    .array(z.lazy(() => syllabusComponentSchema))
    .nullable()
    .optional(),
});

const parsedSyllabusSchema = z.object({
  normal_total_points: z.number().nullable().optional(),
  components: z.array(syllabusComponentSchema).default([]),
});

export async function runSyllabusAnalysis(params: {
  scope: CourseScope;
  sections: readonly ScopedRenderedSection[];
  gradeData: readonly CoreGradesGetUserGradesTableWSResponse[];
  identifiers: readonly string[];
}) {
  const { scope, sections, gradeData, identifiers } = params;
  const selected = selectSyllabusArtifact(sections);
  if (!selected) {
    return buildFailedPayload(scope, "No syllabus-like artifact found for this course scope.");
  }

  if (selected.isPdf && selected.localPath && !(await safeStat(selected.localPath))) {
    return buildFailedPayload(scope, "Syllabus PDF has not been synced to disk yet.");
  }

  const moodleRows = buildMoodleGradeRows(scope, gradeData);
  const workbook = await parseWorkbookEntries(sections, identifiers);
  const fingerprint = await buildFingerprint(scope, selected, moodleRows, workbook.fingerprintEntries);
  const cachedBase = {
    selectedArtifact: selected.identity,
    fingerprint,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!preferences.gemini_api_key) {
    return {
      ...cachedBase,
      parsedSyllabus: { components: [] } satisfies ParsedSyllabusDocument,
      sections: [],
      unassignedMoodleRows: [],
      workbookRowsUsed: [],
      status: "failed" as const,
      error: "Missing Gemini API key in Raycast preferences.",
    };
  }

  try {
    const parsedSyllabus = await parseSyllabus(selected, scope);
    const matched = matchSyllabusToGrades(parsedSyllabus, moodleRows, workbook.entries);

    return {
      ...cachedBase,
      parsedSyllabus,
      sections: matched.sections,
      unassignedMoodleRows: matched.unassignedMoodleRows,
      workbookRowsUsed: matched.workbookRowsUsed,
      status: "ok" as const,
    } satisfies SyllabusAnalysisPayload;
  } catch (error) {
    return {
      ...cachedBase,
      parsedSyllabus: { components: [] } satisfies ParsedSyllabusDocument,
      sections: [],
      unassignedMoodleRows: [],
      workbookRowsUsed: [],
      status: "failed" as const,
      error: error instanceof Error ? error.message : "Unknown syllabus analysis error.",
    } satisfies SyllabusAnalysisPayload;
  }
}

export async function buildAnalysisFingerprint(params: {
  scope: CourseScope;
  sections: readonly ScopedRenderedSection[];
  gradeData: readonly CoreGradesGetUserGradesTableWSResponse[];
  identifiers: readonly string[];
}) {
  const selected = selectSyllabusArtifact(params.sections);
  const moodleRows = buildMoodleGradeRows(params.scope, params.gradeData);
  const workbookFingerprints = await collectWorkbookFingerprints(params.sections);

  return {
    selected,
    moodleRows,
    workbook: workbookFingerprints,
    fingerprint: selected ? await buildFingerprint(params.scope, selected, moodleRows, workbookFingerprints) : null,
  };
}

export function buildMoodleGradeRows(scope: CourseScope, gradeData: readonly CoreGradesGetUserGradesTableWSResponse[]) {
  return gradeData.flatMap((courseData, index) => {
    const courseId = scope.courseIds[index];
    if (courseId == null) return [];

    return (courseData.tables?.[0]?.tabledata ?? []).flatMap((row, rowIndex) => {
      const item = extractGradeRowLabel(row.itemname?.content || "");
      const label = item.label.trim();
      if (!label || isIgnoredMoodleRow(label)) return [];

      const moduleType = getModuleTypeFromGradeHref(item.href);
      const range = parseGradeRange(row.grade?.content || "", row.range?.content || "");
      return [
        {
          id: `${courseId}:${row.itemname?.id ?? rowIndex}`,
          courseId,
          label,
          normalizedLabel: normalizeLabel(label),
          kind: classifyGradeKind(label, moduleType),
          raw: range.raw,
          max: range.max,
          pct: range.pct,
          posted: range.posted,
          source: "moodle" as const,
          moduleId: getModuleIdFromGradeHref(item.href),
          row,
          rowIndex,
        } satisfies MoodleGradeRow,
      ];
    });
  });
}

function isIgnoredMoodleRow(label: string) {
  const normalized = normalizeLabel(label);
  return (
    normalized === "course total" || normalized.includes("kurzus osszegezve") || normalized.includes("course total")
  );
}

async function buildFingerprint(
  scope: CourseScope,
  selected: SelectedSyllabusArtifact,
  moodleRows: MoodleGradeRow[],
  workbookEntries: WorkbookFingerprintEntry[],
) {
  const syllabusSignal = await buildArtifactFingerprint(selected);
  return hashAnalysisInputs({
    scopeId: scope.id,
    courseIds: scope.courseIds,
    syllabus: syllabusSignal,
    gradeRows: moodleRows.map((row) => ({
      courseId: row.courseId,
      label: row.normalizedLabel,
      raw: row.raw,
      max: row.max,
      pct: row.pct,
      moduleId: row.moduleId,
    })),
    workbooks: workbookEntries,
  });
}

async function buildArtifactFingerprint(selected: SelectedSyllabusArtifact) {
  if (!selected.localPath) {
    return {
      identity: selected.identity,
      modificationSignal: selected.modificationSignal,
    };
  }

  const details = await safeStat(selected.localPath);
  if (!details) {
    return {
      identity: selected.identity,
      modificationSignal: selected.modificationSignal,
    };
  }

  return {
    identity: selected.identity,
    modificationSignal: `${selected.modificationSignal}:${details.mtimeMs}:${details.size}`,
  };
}

async function parseSyllabus(selected: SelectedSyllabusArtifact, scope: CourseScope) {
  const provider = createGoogleGenerativeAI({
    apiKey: preferences.gemini_api_key,
  });
  const pdfUri = await getUploadedPdfUri(selected);
  const promptText = buildSyllabusPrompt(scope, selected);

  if (!selected.inlineText && !pdfUri) {
    throw new Error("The selected syllabus artifact has no readable inline text or uploaded PDF reference.");
  }

  try {
    const result = await generateText({
      model: provider("gemini-2.5-flash"),
      temperature: 0,
      output: Output.object({
        schema: parsedSyllabusSchema,
      }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            ...(pdfUri
              ? [
                  {
                    type: "file" as const,
                    data: new URL(pdfUri),
                    mediaType: "application/pdf",
                    filename: selected.identity.contentFilename ?? "syllabus.pdf",
                  },
                ]
              : []),
          ],
        },
      ],
    });

    await dumpGeminiResponse(scope, result);

    return {
      normal_total_points: result.output.normal_total_points ?? null,
      components: result.output.components ?? [],
    } satisfies ParsedSyllabusDocument;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      logNoObjectGeneratedError(error);
    }
    throw error;
  }
}

function logNoObjectGeneratedError(error: NoObjectGeneratedError) {
  console.error("syllabus-analysis: structured output failed", {
    message: error.message,
    text: truncateForLog(error.text),
    cause: error.cause instanceof Error ? error.cause.message : error.cause,
    finishReason: error.finishReason,
    usage: error.usage,
    response: {
      id: error.response?.id,
      modelId: error.response?.modelId,
      timestamp: error.response?.timestamp,
    },
  });
}

const TMP_DIR = resolve(process.cwd(), "tmp", "gemini-responses");
console.log("syllabus-analysis: Gemini response dumps will be saved to", TMP_DIR);
async function dumpGeminiResponse(scope: CourseScope, result: Awaited<ReturnType<typeof generateText>>) {
  try {
    await mkdir(TMP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const file = join(TMP_DIR, `syllabus-${scope.id}-${ts}.json`);
    await writeFile(
      file,
      JSON.stringify(
        {
          scopeId: scope.id,
          modelId: result.response?.modelId,
          output: result.output,
          text: result.text,
          usage: result.usage,
          finishReason: result.finishReason,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log("syllabus-analysis: saved gemini response to", file);
  } catch (error) {
    console.warn("syllabus-analysis: failed to save gemini response", error);
  }
}

function truncateForLog(value: string | undefined, maxLength = 4_000) {
  if (!value) return value;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

async function getUploadedPdfUri(selected: SelectedSyllabusArtifact) {
  if (!selected.isPdf || !selected.localPath) {
    return null;
  }

  const details = await safeStat(selected.localPath);
  if (!details) return null;

  const fingerprint = `${selected.localPath}:${details.mtimeMs}:${details.size}`;
  const cached = uploadedPdfUriByFingerprint.get(fingerprint);
  if (cached) {
    return await cached;
  }

  const uploadPromise = uploadPdfToGemini(selected.localPath, selected.identity.contentFilename ?? "syllabus.pdf");
  uploadedPdfUriByFingerprint.set(fingerprint, uploadPromise);
  return await uploadPromise;
}

function buildFailedPayload(scope: CourseScope, message: string) {
  const now = new Date().toISOString();
  return {
    selectedArtifact: {
      scopedModuleId: `${scope.id}:missing`,
      courseId: scope.mergedCourse.id,
      moduleId: -1,
      moduleName: "Unknown",
      modname: "unknown",
    },
    parsedSyllabus: { components: [] } satisfies ParsedSyllabusDocument,
    sections: [],
    unassignedMoodleRows: [],
    workbookRowsUsed: [],
    fingerprint: sha1({ scopeId: scope.id, missing: true }),
    status: "failed" as const,
    error: message,
    createdAt: now,
    updatedAt: now,
  } satisfies SyllabusAnalysisPayload;
}

async function safeStat(targetPath: string) {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

async function uploadPdfToGemini(localPath: string, displayName: string) {
  try {
    const client = new GoogleGenAI({
      apiKey: preferences.gemini_api_key,
    });

    const uploaded = await client.files.upload({
      file: localPath,
      config: {
        mimeType: "application/pdf",
        displayName,
      },
    });

    if (!uploaded.name) {
      throw new Error("Gemini file upload returned no file name.");
    }

    const finalized = await waitForGeminiFile(client, uploaded.name);
    return finalized.uri ?? null;
  } catch (error) {
    console.error("syllabus-analysis: pdf upload failed", error);
    return null;
  }
}

async function waitForGeminiFile(client: GoogleGenAI, fileName: string) {
  let current = await client.files.get({ name: fileName });

  for (let attempt = 0; attempt < 20; attempt++) {
    if (current.state === FileState.ACTIVE) {
      return current;
    }
    if (current.state === FileState.FAILED) {
      throw new Error(current.error?.message || "Gemini file processing failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(500 * (attempt + 1), 2_000)));
    current = await client.files.get({ name: fileName });
  }

  throw new Error("Timed out waiting for Gemini file processing.");
}

function buildSyllabusPrompt(scope: CourseScope, selected: SelectedSyllabusArtifact) {
  return [
    "Extract only grading-related syllabus facts for the merged course scope.",
    "",
    "Rules:",
    "- Treat lecture and seminar shells as already merged before evaluation.",
    "- Use points as the canonical internal unit.",
    "- If the syllabus gives percentages only, set `normal_total_points` to 100 and convert percentages into points.",
    "- Keep the structure hierarchical and points-first.",
    "- Top-level grading buckets belong in `components`.",
    "- Child rubric items belong in `children`.",
    "- Return `group`, `index`, and `count` for sequential items when present or strongly implied.",
    "- Return `deadline_hint` or `week_hint` only when the syllabus explicitly provides them.",
    "- Keep `evidence` short and literal.",
    "- Do not invent Moodle behavior, workbook behavior, weighting rules, or hidden grading assumptions.",
    "- Do not include attendance or eligibility prose unless it directly affects graded components.",
    "",
    "Examples (showing expected JSON shapes):",
    "",
    "1. Flat weighted: Participation 10%, Midterm 30%, Final 60% → normal_total_points: 100, components:",
    '   [{ "name": "Participation", "max_points": 10, "evidence": ["Participation 10%"] },',
    '    { "name": "Midterm exam", "max_points": 30, "evidence": ["Midterm exam 30%"] },',
    '    { "name": "Final exam", "max_points": 60, "evidence": ["Final exam 60%"] }]',
    "",
    "2. Nested parent: Seminar assignments 40 pts total (Presentation 10, Report 15, Peer review 15) →",
    '   { "name": "Seminar assignments", "max_points": 40, "evidence": ["Seminar assignments 40 points"],',
    '     "children": [',
    '       { "name": "Presentation", "max_points": 10, "evidence": ["Presentation 10"] },',
    '       { "name": "Report", "max_points": 15, "evidence": ["Report 15"] },',
    '       { "name": "Peer review", "max_points": 15, "evidence": ["Peer review 15"] }] }',
    "",
    "3. Sequential without deadlines: 3 homework assignments, 10 pts each →",
    '   { "name": "Homework", "max_points": 30, "evidence": ["3 homework assignments, 10 points each"],',
    '     "children": [',
    '       { "name": "Homework 1", "max_points": 10, "group": "homework", "index": 1, "count": 3, "evidence": [] },',
    '       { "name": "Homework 2", "max_points": 10, "group": "homework", "index": 2, "count": 3, "evidence": [] },',
    '       { "name": "Homework 3", "max_points": 10, "group": "homework", "index": 3, "count": 3, "evidence": [] }] }',
    "",
    "4. Sequential with deadlines: Milestone 1 due Week 4, 10 pts; Milestone 2 due Week 8, 15 pts →",
    '   { "name": "Milestones", "max_points": 25, "children": [',
    '       { "name": "Milestone 1", "max_points": 10, "group": "milestone", "index": 1, "count": 2, "week_hint": "4", "evidence": ["Milestone 1 due Week 4, 10 points"] },',
    '       { "name": "Milestone 2", "max_points": 15, "group": "milestone", "index": 2, "count": 2, "week_hint": "8", "evidence": ["Milestone 2 due Week 8, 15 points"] }] }',
    "",
    "5. Best-N-of-M: 10 quizzes, best 6 count for 30% →",
    '   { "name": "Quizzes", "max_points": 30, "count": 10, "evidence": ["10 quizzes, best 6 count for 30%"] }',
    "   Do not expand unnamed quizzes into individual children.",
    "",
    ...(selected.isPdf && selected.localPath
      ? [
          "A PDF is attached as the primary source.",
          ...(selected.inlineText
            ? ["", "Fallback inline text (use only if the PDF is unclear):", selected.inlineText]
            : []),
        ]
      : ["Inline syllabus text:", selected.inlineText || "(none)"]),
    "",
    "Do not infer missing structure beyond what the source material says.",
  ].join("\n");
}
