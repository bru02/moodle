import { existsSync } from "fs";
import { readFile, stat } from "fs/promises";
import os from "os";
import { basename, extname } from "path";

import { createGoogleGenerativeAI, GoogleLanguageModelOptions } from "@ai-sdk/google";
import { JSONParseError, TypeValidationError } from "@ai-sdk/provider";
import { generateObject, generateText, type LanguageModel } from "ai";
import { z } from "zod";

import { extractGradingFocusedText } from "./fallback";
import { normalizeLabel } from "./text";
import { ParsedSyllabusDocument } from "./types";

const knownKinds = [
  "quiz",
  "midterm",
  "final_exam",
  "assignment",
  "project",
  "presentation",
  "participation",
  "extra",
  "other",
] as const;

type RawSyllabusComponent = Omit<ParsedSyllabusDocument["components"][number], "children"> & {
  children?: (RawSyllabusComponent | string | null)[] | null;
};

const componentSchema: z.ZodType<RawSyllabusComponent> = z.lazy(() =>
  z.object({
    name: z.string(),
    kind: z.enum(knownKinds).optional(),
    max_points: z.number().nullable().optional(),
    group: z.string().nullable().optional(),
    index: z.number().int().nullable().optional(),
    count: z.number().int().nullable().optional(),
    best_of: z.number().int().nullable().optional(),
    deadline_hint: z.string().nullable().optional(),
    week_hint: z.string().nullable().optional(),
    evidence: z.array(z.string()).nullable().optional(),
    children: z
      .array(z.union([componentSchema, z.string(), z.null()]))
      .nullable()
      .optional(),
  }),
);

const syllabusSchema = z.object({
  normal_total_points: z.number().nullable().optional(),
  components: z.array(componentSchema),
});

type RawSyllabusDocument = z.infer<typeof syllabusSchema>;

type LlmDocument = {
  sourceLabel: string;
  sectionName: string;
  text: string;
  localPath?: string;
  isPdf?: boolean;
};

const SYLLABUS_THINKING_CONFIG = {
  thinkingBudget: 8192,
  includeThoughts: true,
} as const;

const SYLLABUS_SYSTEM_PROMPT = [
  "Extract only the grading structure for a university course.",
  "Return category buckets even if Moodle does not have posted grades yet.",
  "Create placeholder children when the syllabus implies repeated future items.",
  "Preserve the language used by the syllabus and matching Moodle rows. If the course materials are in Hungarian, prefer Hungarian bucket and child names instead of translating them into English.",
  "Ignore assignment instructions, lecture topics, software setup, plagiarism policy, schedules, and descriptive prose unless they directly define grading.",
  "Do not invent posted scores or Moodle labels that are not supported by the documents.",
  "Prefer concise bucket names such as Lecture quizzes, Midterm exams, Project work, Assignments, Extra credit, but keep the original course language.",
  "When a Moodle row clearly corresponds to a syllabus child and its max points align, prefer that Moodle wording or a short cleaned version of it over a generic paraphrase.",
  "Keep recurring weekly tests/quizzes separate from recurring weekly assignments/homework when the syllabus distinguishes them.",
  "Include mandatory recurring checks that gate completion even when they are pass/fail or not directly point-based, such as weekly tests that must be completed successfully a minimum number of times.",
  "Do not create catch-all buckets like Alternative path, Other work, or Final exam fallback unless the syllabus explicitly defines a distinct graded component with that scope.",
  "Do not absorb unrelated Moodle rows into a final exam or alternative-path bucket just because they remain unmatched.",
  "Every child item must be a concrete object with a name. Never emit null children.",
  "When evidence is ambiguous, keep fewer but cleaner grading buckets instead of hallucinating.",
].join(" ");

export async function parseSyllabusWithGemini(params: {
  geminiApiKey?: string;
  documents: readonly LlmDocument[];
  moodleRows: readonly {
    label: string;
    kind: string;
    max: number | null;
    moduleName?: string;
    sectionName?: string;
  }[];
  workbookRows: readonly {
    label: string;
    headerLabel: string;
    kind: string;
    max: number | null;
    sheetName: string;
    workbookPath: string;
    contextLabels: string[];
  }[];
  _internal?: {
    model?: LanguageModel;
  };
}) {
  const { geminiApiKey, documents, moodleRows, workbookRows, _internal } = params;
  const content = await buildUserContent(documents, moodleRows, workbookRows);
  const model = _internal?.model ?? (await createSyllabusModel(geminiApiKey));
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject({
        model,
        schema: syllabusSchema,
        providerOptions: getSyllabusProviderOptions(),
        experimental_repairText: repairSyllabusJsonText,
        system: SYLLABUS_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });

      return sanitizeParsedDocument(object);
    } catch (error) {
      lastError = error;
    }
  }

  const recovered = await tryRecoverParsedDocumentFromText({
    model,
    content,
  });

  if (recovered) {
    return recovered;
  }

  throw lastError;
}

export function hasConfiguredGeminiProvider(geminiApiKey?: string) {
  return usesGeminiCliProviderInDev() ? hasGeminiCliOauthCredentials() || Boolean(geminiApiKey) : Boolean(geminiApiKey);
}

async function buildUserContent(
  documents: readonly LlmDocument[],
  moodleRows: readonly {
    label: string;
    kind: string;
    max: number | null;
    moduleName?: string;
    sectionName?: string;
  }[],
  workbookRows: readonly {
    label: string;
    headerLabel: string;
    kind: string;
    max: number | null;
    sheetName: string;
    workbookPath: string;
    contextLabels: string[];
  }[],
) {
  const fileParts = await buildPdfFileParts(documents);
  const prompt = buildSyllabusPrompt(documents, moodleRows, workbookRows, fileParts.length);

  return [{ type: "text" as const, text: prompt }, ...fileParts];
}

async function buildPdfFileParts(documents: readonly LlmDocument[]) {
  const uniquePdfPaths = [...new Set(documents.map((document) => document.localPath).filter(isPdfPath))].slice(0, 2);
  const fileParts: {
    type: "file";
    data: Buffer;
    mediaType: "application/pdf";
    filename: string;
  }[] = [];

  for (const pdfPath of uniquePdfPaths) {
    try {
      const details = await stat(pdfPath);
      if (details.size > 15 * 1024 * 1024) continue;
      fileParts.push({
        type: "file",
        data: await readFile(pdfPath),
        mediaType: "application/pdf",
        filename: basename(pdfPath),
      });
    } catch {
      /* ignore unreadable files */
    }
  }

  return fileParts;
}

export function buildSyllabusPrompt(
  documents: readonly LlmDocument[],
  moodleRows: readonly {
    label: string;
    kind: string;
    max: number | null;
    moduleName?: string;
    sectionName?: string;
  }[],
  workbookRows: readonly {
    label: string;
    headerLabel: string;
    kind: string;
    max: number | null;
    sheetName: string;
    workbookPath: string;
    contextLabels: string[];
  }[],
  _pdfFileCount?: number,
) {
  const documentBlocks = documents
    .map((document, index) =>
      [
        `## Document ${index + 1}: ${document.sourceLabel}`,
        `Section: ${document.sectionName}`,
        `Format: ${document.isPdf ? "pdf" : extname(document.localPath || "").replace(/^\./, "") || "text"}`,
        "",
        "```md",
        truncateForPrompt(extractGradingFocusedText(document.text) || document.text),
        "```",
      ].join("\n"),
    )
    .join("\n\n");

  const moodleBlock = moodleRows
    .slice(0, 80)
    .map((row) =>
      [
        `- ${row.label}`,
        `[kind=${row.kind}${row.max != null ? `, max=${row.max}` : ""}`,
        row.moduleName ? `, module=${row.moduleName}` : "",
        row.sectionName ? `, section=${row.sectionName}` : "",
        "]",
      ].join(""),
    )
    .join("\n");

  const workbookBlock = workbookRows
    .slice(0, 80)
    .map((row) => {
      const extraContext = row.contextLabels
        .filter((value) => value !== row.label && value !== row.headerLabel && value !== row.sheetName)
        .slice(0, 3)
        .join(" | ");

      return [
        `- ${row.label}`,
        `[header=${row.headerLabel}`,
        `, kind=${row.kind}`,
        row.max != null ? `, max=${row.max}` : "",
        `, sheet=${row.sheetName}`,
        `, workbook=${basename(row.workbookPath)}`,
        extraContext ? `, context=${extraContext}` : "",
        "]",
      ].join("");
    })
    .join("\n");

  return [
    "# Task",
    "Infer the course grading structure from the attached syllabus evidence.",
    "Use the Moodle assignment names and workbook column headers as naming hints so generic syllabus buckets can line up with real graded items.",
    "",
    "# Rules",
    "- Use Moodle row names and workbook column headers as alignment hints for naming and disambiguation, not as proof by themselves.",
    "- Preserve the original course language. If the syllabus and Moodle labels are Hungarian, keep Hungarian names instead of translating them.",
    "- Prefer concrete Moodle child labels when they clearly correspond to syllabus items and their max points line up better than a generic label.",
    "- If the syllabus says there are 2 quizzes or 2 midterms, emit 2 child items even if Moodle has none.",
    "- If the syllabus defines mandatory recurring tests/quizzes that gate completion, include them as a component even when they do not directly contribute points.",
    "- Keep recurring quizzes/tests separate from recurring assignments when the syllabus treats them separately.",
    "- If the syllabus gives a split like 15+5 points, emit child items for the split.",
    "- If the syllabus gives overall percentages or point totals, preserve them in max_points / normal_total_points when possible.",
    "- Do not use null placeholders. If an item exists but is unnamed, emit a concrete placeholder like Assignment 1 or Midterm exam 2.",
    "- Do not create broad fallback buckets such as Alternative path unless the document explicitly names and scopes that component.",
    "- Do not turn policies, instructions, or long descriptive sentences into grade items.",
    "- When a syllabus bucket is generic but Moodle/workbook names reveal the concrete assignment names, prefer the concrete names.",
    "",
    "# Documents",
    documentBlocks || "(none)",
    "",
    "# Moodle Rows",
    moodleBlock || "(none)",
    "",
    "# Workbook Columns",
    workbookBlock || "(none)",
  ].join("\n");
}

function truncateForPrompt(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 18000) return trimmed;
  return `${trimmed.slice(0, 18000)}\n...[truncated]`;
}

async function createSyllabusModel(geminiApiKey?: string) {
  if (usesGeminiCliProviderInDev()) {
    const { createGeminiProvider } = await import("ai-sdk-provider-gemini-cli");
    const provider = createGeminiProvider(
      geminiApiKey
        ? {
            authType: "gemini-api-key",
            apiKey: geminiApiKey,
          }
        : {
            authType: "oauth-personal",
          },
    );

    return provider("gemini-2.5-flash", {
      thinkingConfig: SYLLABUS_THINKING_CONFIG,
    });
  }

  const provider = createGoogleGenerativeAI({ apiKey: geminiApiKey });
  return provider("gemini-2.5-flash");
}

function getSyllabusProviderOptions() {
  if (usesGeminiCliProviderInDev()) {
    return undefined;
  }

  return {
    google: {
      thinkingConfig: SYLLABUS_THINKING_CONFIG,
    } satisfies GoogleLanguageModelOptions,
  };
}

function usesGeminiCliProviderInDev() {
  return process.env.NODE_ENV !== "production";
}

function hasGeminiCliOauthCredentials() {
  return existsSync(`${os.homedir()}/.gemini/oauth_creds.json`);
}

function isPdfPath(value: string | undefined): value is string {
  return typeof value === "string" && /\.pdf$/i.test(value);
}

async function repairSyllabusJsonText({ text, error }: { text: string; error: JSONParseError | TypeValidationError }) {
  if (!JSONParseError.isInstance(error)) {
    return null;
  }

  const repaired = repairJsonishObjectText(text);
  return repaired && repaired !== text ? repaired : null;
}

function repairJsonishObjectText(value: string) {
  let repaired = value.trim().replace(/^\uFEFF/, "");
  repaired = stripCodeFences(repaired);
  repaired = repaired.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  repaired = extractLikelyJsonPayload(repaired);
  repaired = repaired.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  repaired = repaired.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
  repaired = repaired.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, content: string) =>
    JSON.stringify(content.replace(/\\'/g, "'")),
  );
  repaired = repaired.replace(/,\s*([}\]])/g, "$1").trim();

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

async function tryRecoverParsedDocumentFromText(params: {
  model: LanguageModel;
  content: Awaited<ReturnType<typeof buildUserContent>>;
}) {
  try {
    const { text } = await generateText({
      model: params.model,
      providerOptions: getSyllabusProviderOptions(),
      system: `${SYLLABUS_SYSTEM_PROMPT} Return only a JSON object matching the requested grading schema. Do not wrap it in markdown.`,
      messages: [{ role: "user", content: params.content }],
    });
    const repaired = repairJsonishObjectText(text);
    if (!repaired) return null;

    const parsed = syllabusSchema.safeParse(JSON.parse(repaired));
    if (!parsed.success) return null;

    return sanitizeParsedDocument(parsed.data);
  } catch {
    return null;
  }
}

function stripCodeFences(value: string) {
  return value.replace(/^\s*```(?:json|jsonc|javascript|js|typescript|ts)?\s*/i, "").replace(/\s*```\s*$/i, "");
}

function extractLikelyJsonPayload(value: string) {
  const objectStart = value.indexOf("{");
  const arrayStart = value.indexOf("[");
  const startCandidates = [objectStart, arrayStart].filter((index) => index >= 0);
  if (startCandidates.length === 0) {
    return value;
  }

  const start = Math.min(...startCandidates);
  const openingChar = value[start];
  const closingChar = openingChar === "[" ? "]" : "}";
  const end = value.lastIndexOf(closingChar);

  if (end < start) {
    return value.slice(start);
  }

  return value.slice(start, end + 1);
}

function sanitizeParsedDocument(document: RawSyllabusDocument): ParsedSyllabusDocument {
  return {
    normal_total_points: document.normal_total_points ?? null,
    components: document.components
      .map((component) => sanitizeComponent(component))
      .filter((component): component is ParsedSyllabusDocument["components"][number] => component != null),
  };
}

function sanitizeComponent(component: RawSyllabusComponent): ParsedSyllabusDocument["components"][number] | null {
  const inferredKind = component.kind ?? inferKindFromLabel(component.name);
  const children =
    component.children
      ?.filter((child): child is RawSyllabusComponent | string => child != null)
      .map((child) =>
        typeof child === "string"
          ? sanitizeComponent({
              name: child,
              kind: inferKindFromLabel(child) ?? inferredKind,
            })
          : sanitizeComponent(child),
      )
      .filter((child): child is ParsedSyllabusDocument["components"][number] => child != null) ?? undefined;

  if (isAdministrativeSyllabusLabel(component.name) && (!children || children.length === 0)) {
    return null;
  }

  return {
    ...component,
    kind: inferredKind,
    children,
  };
}

function inferKindFromLabel(label: string) {
  const normalized = label.toLowerCase();
  if (/\b(midterm|moodle tests?|test)\b/.test(normalized)) return "quiz";
  if (/\bfinal\b/.test(normalized)) return "final_exam";
  if (/\bproject\b/.test(normalized)) return "project";
  if (/\bpresentation\b/.test(normalized)) return "presentation";
  if (/\bassignment|homework|seminar\b/.test(normalized)) return "assignment";
  if (/\bparticipation|attendance\b/.test(normalized)) return "participation";
  if (/\bbonus|extra|kahoot\b/.test(normalized)) return "extra";
  return undefined;
}

function isAdministrativeSyllabusLabel(label: string) {
  const normalized = normalizeLabel(label);
  if (/\b(submission page|upload|feltolto felulet|feltoltesi felulet|beadas|feltoltese)\b/.test(normalized)) {
    return true;
  }
  if (/\b(lecke|lesson)\b/.test(normalized)) return true;
  if (/^group [a-z0-9]+$/.test(normalized)) return true;
  return false;
}
