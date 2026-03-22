import { execFile } from "child_process";
import { mkdtemp, readFile, rm, stat, writeFile as writeFileFs } from "fs/promises";
import os from "os";
import path from "path";

import type { CourseScope, ScopedRenderedSection, SimpleCourse } from "@moodle/core";

import { CoreWSExternalFile, Module } from "../types";
import { CoreGradesGetUserGradesTableWSResponse } from "../types/grade";
import { buildFallbackParsedSyllabus, supplementParsedSyllabusWithObservedRows } from "./fallback";
import { ensureAnalysisFileOnDisk, getAnalysisFilePath, toAuthenticatedFileUrl } from "./file-sync";
import { hasConfiguredGeminiProvider, parseSyllabusWithGemini } from "./llm";
import { hashAnalysisInputs, pickBestSyllabusCandidate } from "./logic";
import { matchSyllabusToGrades } from "./matching";
import {
  classifyGradeKind,
  extractGradeRowLabel,
  getModuleIdFromGradeHref,
  getModuleTypeFromGradeHref,
  inferLabelPointLimit,
  parseGradeRange,
  stripHtmlText,
} from "./pure-utils";
import { getFileSortScore, getSyllabusArtifactScore } from "./scoring";
import { normalizeLabel } from "./text";
import { MoodleGradeRow, ParsedSyllabusDocument, SelectedSyllabusArtifact, SyllabusAnalysisPayload } from "./types";
import { parseWorkbookEntries } from "./workbook";

let liteParseInstancePromise: Promise<{
  parse(filePath: string, quiet?: boolean): Promise<{ text: string }>;
}> | null = null;

type RuntimeOptions = {
  accessKey?: string;
  geminiApiKey?: string;
  siteUrl?: string;
  syncFolder?: string;
};

export async function runSyllabusAnalysisPipeline(params: {
  scope: CourseScope;
  sections: readonly ScopedRenderedSection[];
  gradeData: readonly CoreGradesGetUserGradesTableWSResponse[];
  identifiers: readonly string[];
  options?: RuntimeOptions;
}) {
  const { scope, sections, gradeData, identifiers, options } = params;
  const moodleRows = buildMoodleGradeRows(scope, gradeData, options?.siteUrl, sections);
  const workbook = await parseWorkbookEntries(sections, identifiers, {
    accessKey: options?.accessKey,
    syncFolder: options?.syncFolder,
  });
  const selected = await selectSyllabusArtifactForAnalysis(sections, options?.syncFolder);
  if (!selected) {
    const fallbackParsed = supplementParsedSyllabusWithObservedRows({
      parsed: buildFallbackParsedSyllabus({
        moodleRows,
        workbookRows: workbook.entries,
      }),
      moodleRows,
    });
    if (fallbackParsed.components.length === 0) {
      return buildFailedPayload(scope, "No syllabus-like artifact found for this course scope.");
    }

    const fallbackSelected = buildSyntheticArtifact(scope);
    const matched = matchSyllabusToGrades(fallbackParsed, moodleRows, workbook.entries);

    return {
      selectedArtifact: fallbackSelected.identity,
      fingerprint: hashAnalysisInputs({
        scopeId: scope.id,
        courseIds: scope.courseIds,
        synthetic: true,
        gradeRows: moodleRows.map((row) => ({
          courseId: row.courseId,
          label: row.normalizedLabel,
          raw: row.raw,
          max: row.max,
        })),
        workbooks: workbook.fingerprintEntries,
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parsedSyllabus: fallbackParsed,
      sections: matched.sections,
      unassignedMoodleRows: matched.unassignedMoodleRows,
      workbookRowsUsed: matched.workbookRowsUsed,
      status: "ok" as const,
    } satisfies SyllabusAnalysisPayload;
  }

  const fingerprint = await buildFingerprint(scope, selected, moodleRows, workbook.fingerprintEntries);
  const cachedBase = {
    selectedArtifact: selected.identity,
    fingerprint,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!hasConfiguredGeminiProvider(options?.geminiApiKey)) {
    const fallbackParsed = supplementParsedSyllabusWithObservedRows({
      parsed: buildFallbackParsedSyllabus({
        moodleRows,
        workbookRows: workbook.entries,
      }),
      moodleRows,
    });
    if (fallbackParsed.components.length === 0) {
      return buildCachedFailurePayload(cachedBase, "Gemini is not configured for syllabus analysis.");
    }

    const matched = matchSyllabusToGrades(fallbackParsed, moodleRows, workbook.entries);
    return {
      ...cachedBase,
      parsedSyllabus: fallbackParsed,
      sections: matched.sections,
      unassignedMoodleRows: matched.unassignedMoodleRows,
      workbookRowsUsed: matched.workbookRowsUsed,
      status: "ok" as const,
    } satisfies SyllabusAnalysisPayload;
  }

  try {
    const documents = await collectArtifactDocuments(selected, sections, {
      accessKey: options?.accessKey,
      syncFolder: options?.syncFolder,
    });
    if (documents.length === 0) {
      const fallbackParsed = supplementParsedSyllabusWithObservedRows({
        parsed: buildFallbackParsedSyllabus({
          moodleRows,
          workbookRows: workbook.entries,
        }),
        moodleRows,
      });
      if (fallbackParsed.components.length === 0) {
        return buildCachedFailurePayload(
          cachedBase,
          "Could not extract readable syllabus content from the selected artifact.",
        );
      }

      const matched = matchSyllabusToGrades(fallbackParsed, moodleRows, workbook.entries);
      return {
        ...cachedBase,
        parsedSyllabus: fallbackParsed,
        sections: matched.sections,
        unassignedMoodleRows: matched.unassignedMoodleRows,
        workbookRowsUsed: matched.workbookRowsUsed,
        status: "ok" as const,
      } satisfies SyllabusAnalysisPayload;
    }

    const llmDocuments = documents.map((document) => ({
      sourceLabel: document.sourceLabel,
      sectionName: document.sectionName,
      text: document.text,
      localPath: document.localPath,
      isPdf: document.isPdf,
    }));

    const parsedSyllabus = supplementParsedSyllabusWithObservedRows({
      parsed: await parseSyllabusWithGemini({
        geminiApiKey: options?.geminiApiKey,
        documents: llmDocuments,
        moodleRows: moodleRows.map((row) => ({
          label: row.label,
          kind: row.kind,
          max: row.max,
          moduleName: row.moduleName,
          sectionName: row.sectionName,
        })),
        workbookRows: workbook.entries.map((row) => ({
          label: row.label,
          headerLabel: row.headerLabel,
          kind: row.kind,
          max: row.max,
          sheetName: row.sheetName,
          workbookPath: row.workbookPath,
          contextLabels: row.contextLabels,
        })),
      }),
      documents: documents.map((document) => ({
        sourceLabel: document.sourceLabel,
        text: document.text,
      })),
      moodleRows,
    });
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
    const documents = await collectArtifactDocuments(selected, sections, {
      accessKey: options?.accessKey,
      syncFolder: options?.syncFolder,
    }).catch(() => []);
    const fallbackParsed = supplementParsedSyllabusWithObservedRows({
      parsed: buildFallbackParsedSyllabus({
        documents: documents.map((document) => ({
          sourceLabel: document.sourceLabel,
          text: document.text,
        })),
        moodleRows,
        workbookRows: workbook.entries,
      }),
      documents: documents.map((document) => ({
        sourceLabel: document.sourceLabel,
        text: document.text,
      })),
      moodleRows,
    });
    if (fallbackParsed.components.length === 0) {
      return buildCachedFailurePayload(
        cachedBase,
        error instanceof Error ? error.message : "Unknown syllabus analysis error.",
      );
    }

    const matched = matchSyllabusToGrades(fallbackParsed, moodleRows, workbook.entries);
    return {
      ...cachedBase,
      parsedSyllabus: fallbackParsed,
      sections: matched.sections,
      unassignedMoodleRows: matched.unassignedMoodleRows,
      workbookRowsUsed: matched.workbookRowsUsed,
      status: "ok" as const,
    } satisfies SyllabusAnalysisPayload;
  }
}

export async function buildAnalysisFingerprintData(params: {
  scope: CourseScope;
  sections: readonly ScopedRenderedSection[];
  gradeData: readonly CoreGradesGetUserGradesTableWSResponse[];
  options?: RuntimeOptions;
}) {
  const selected = await selectSyllabusArtifactForAnalysis(params.sections, params.options?.syncFolder);
  const moodleRows = buildMoodleGradeRows(params.scope, params.gradeData, params.options?.siteUrl, params.sections);
  const workbook = await parseWorkbookEntries(params.sections, [], { syncFolder: params.options?.syncFolder });

  return {
    selected,
    moodleRows,
    workbook,
    fingerprint: selected
      ? await buildFingerprint(params.scope, selected, moodleRows, workbook.fingerprintEntries)
      : null,
  };
}

export function buildMoodleGradeRows(
  scope: CourseScope,
  gradeData: readonly CoreGradesGetUserGradesTableWSResponse[],
  siteUrl?: string,
  sections: readonly ScopedRenderedSection[] = [],
) {
  const moduleContextById = buildModuleContextIndex(sections);
  return gradeData.flatMap((courseData, index) => {
    const courseId = scope.courseIds[index];
    if (courseId == null) return [];

    return (courseData.tables?.[0]?.tabledata ?? []).flatMap((row, rowIndex) => {
      const item = extractGradeRowLabel(row.itemname?.content || "");
      const label = item.label.trim();
      const moduleId = getModuleIdFromGradeHref(item.href, siteUrl);
      const moduleContext = moduleId != null ? moduleContextById.get(moduleId) : undefined;
      if (
        !label ||
        isIgnoredMoodleRow(label, row.grade?.content || "", row.range?.content || "", moduleContext) ||
        isCategoryLikeRow(row.itemname?.class, item.href)
      ) {
        return [];
      }

      const moduleType = moduleContext?.modname || getModuleTypeFromGradeHref(item.href, siteUrl);
      const explicitMax = inferLabelPointLimit(label);
      const parsedRange = parseGradeRange(row.grade?.content || "", row.range?.content || "");
      const raw =
        parsedRange.raw != null && explicitMax != null ? Math.min(parsedRange.raw, explicitMax) : parsedRange.raw;
      const max = explicitMax ?? parsedRange.max;
      const pct = raw != null && max ? (raw / max) * 100 : null;
      const kind = classifyGradeKind(label, moduleType);
      if (isAuxiliaryMoodleRow(label, kind, raw, max, moduleContext)) return [];

      return [
        {
          id: `${courseId}:${row.itemname?.id ?? rowIndex}`,
          courseId,
          label,
          normalizedLabel: normalizeLabel(label),
          kind,
          raw,
          max,
          pct,
          posted: raw != null && max != null,
          source: "moodle" as const,
          moduleId,
          moduleName: moduleContext?.name,
          sectionName: moduleContext?.sectionName,
          modulePurpose: moduleContext?.purpose,
          row,
          rowIndex,
        } satisfies MoodleGradeRow,
      ];
    });
  });
}

function buildModuleContextIndex(sections: readonly ScopedRenderedSection[]) {
  return new Map(
    sections.flatMap((section) =>
      section.modules.map(
        ({ module }) =>
          [
            module.id,
            {
              name: module.name,
              modname: module.modname,
              purpose: module.purpose,
              sectionName: section.name,
            },
          ] as const,
      ),
    ),
  );
}

async function buildFingerprint(
  scope: CourseScope,
  selected: SelectedSyllabusArtifact,
  moodleRows: MoodleGradeRow[],
  workbookEntries: { path: string; mtimeMs: number; size: number }[],
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

async function collectArtifactDocuments(
  selected: SelectedSyllabusArtifact,
  sections: readonly ScopedRenderedSection[],
  options?: {
    accessKey?: string;
    syncFolder?: string;
  },
) {
  const artifacts = await Promise.all(
    selectArtifactsForParsing(selected, sections, options?.syncFolder).map(async (artifact) => {
      const localPath =
        artifact.file != null
          ? await ensureAnalysisFileOnDisk({
              file: artifact.file,
              module: artifact.module,
              course: artifact.course,
              accessKey: options?.accessKey,
              syncFolder: options?.syncFolder,
            }).catch(() => artifact.localPath)
          : artifact.localPath;
      const material = await readArtifactMaterial(localPath, artifact.file?.fileurl, options?.accessKey);
      const text = [artifact.inlineText.trim(), material?.text?.trim()].filter(Boolean).join("\n\n");
      return { ...artifact, localPath, text };
    }),
  );

  return artifacts.filter((artifact) => artifact.text.length > 0);
}

async function selectSyllabusArtifactForAnalysis(sections: readonly ScopedRenderedSection[], syncFolder?: string) {
  return pickBestSyllabusCandidate(selectCandidateArtifacts(sections, syncFolder));
}

function selectCandidateArtifacts(sections: readonly ScopedRenderedSection[], syncFolder?: string) {
  const candidates: SelectedSyllabusArtifact[] = [];

  for (const section of sections) {
    for (const scopedModule of section.modules) {
      const { module, course } = scopedModule;
      const inlineText = buildInlineModuleTextPure(module, section.name);
      const moduleScore = getSyllabusArtifactScore(module, section.name);
      const baseScore =
        moduleScore.score + (/\b(test|grading|requirement|assessment|exam|quiz|homework)\b/i.test(module.name) ? 8 : 0);

      const files = module.contents
        ?.filter((content) => content.type === "file")
        .toSorted((left, right) => getFileSortScore(right) - getFileSortScore(left));

      if (files?.length) {
        for (const file of files) {
          const { score, reasons } = getSyllabusArtifactScore(module, section.name, file);
          const localPath = getLocalPath(file, module, course, syncFolder);
          candidates.push({
            identity: {
              scopedModuleId: scopedModule.id,
              courseId: course.id,
              moduleId: module.id,
              moduleName: module.name,
              modname: module.modname,
              contentFilename: file.filename,
              localPath,
            },
            score:
              score +
              (/\b(test|grading|requirement|assessment|exam|quiz|homework)\b/i.test(file.filename || "") ? 8 : 0),
            reasons,
            module,
            course,
            sectionName: section.name,
            file,
            localPath,
            inlineText,
            modificationSignal: `${module.contentsinfo?.lastmodified ?? 0}:${file.timemodified ?? 0}:${file.filesize ?? 0}`,
            sourceLabel: file.filename || module.name,
            isPdf: /\.pdf$/i.test(localPath || file.filename || ""),
          });
        }
      }

      candidates.push({
        identity: {
          scopedModuleId: scopedModule.id,
          courseId: course.id,
          moduleId: module.id,
          moduleName: module.name,
          modname: module.modname,
        },
        score: baseScore + (inlineText.length > 80 ? 4 : 0),
        reasons: moduleScore.reasons.concat(inlineText.length > 80 ? "inline-text" : []),
        module,
        course,
        sectionName: section.name,
        inlineText,
        modificationSignal: `${module.contentsinfo?.lastmodified ?? 0}:${module.description?.length ?? 0}:${inlineText.length}`,
        sourceLabel: module.name,
        isPdf: false,
      });
    }
  }

  return candidates
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return `${left.identity.scopedModuleId}:${left.identity.contentFilename ?? ""}`.localeCompare(
        `${right.identity.scopedModuleId}:${right.identity.contentFilename ?? ""}`,
      );
    })
    .slice(0, 20);
}

function selectArtifactsForParsing(
  selected: SelectedSyllabusArtifact,
  sections: readonly ScopedRenderedSection[],
  syncFolder?: string,
) {
  const selectedKey = artifactKey(selected);
  const chosen = selectCandidateArtifacts(sections, syncFolder).filter(
    (candidate) => artifactKey(candidate) === selectedKey || isParsingCompanionCandidate(selected, candidate),
  );

  if (chosen.some((candidate) => artifactKey(candidate) === selectedKey)) {
    return chosen.slice(0, 4);
  }

  return [selected];
}

function artifactKey(artifact: SelectedSyllabusArtifact) {
  return `${artifact.identity.scopedModuleId}:${artifact.identity.contentFilename ?? ""}`;
}

function isParsingCompanionCandidate(selected: SelectedSyllabusArtifact, candidate: SelectedSyllabusArtifact) {
  if (artifactKey(candidate) === artifactKey(selected)) return true;
  if (candidate.module.purpose === "assessment") return false;
  if (candidate.score < 40) return false;

  const blob = normalizeLabel(
    [candidate.sectionName, candidate.module.name, candidate.file?.filename, candidate.inlineText]
      .filter(Boolean)
      .join(" "),
  );
  const hasStrongSignal =
    /\b(syllabus|requirements?|grading|assessment|course guide|course information|course info|tematika|tantargy|test information)\b/.test(
      blob,
    ) || /\binformation on the tests\b/.test(blob);

  if (hasStrongSignal) return true;
  return selected.sectionName === candidate.sectionName && ["page", "book"].includes(candidate.module.modname);
}

function looksLikeTextArtifactUrl(fileUrl: string) {
  return (
    /\.(html?|txt|md|pdf|docx?|rtf|odt)(?:$|\?)/i.test(fileUrl) || /\/mod_page\/content\/index\.html/i.test(fileUrl)
  );
}

async function readArtifactMaterial(localPath?: string, fileUrl?: string, accessKey?: string) {
  if (localPath) {
    const extension = path.extname(localPath).toLowerCase();
    if ([".html", ".htm"].includes(extension)) {
      try {
        const html = await readFile(localPath, "utf8");
        return { text: stripHtmlText(html) };
      } catch {
        /* fall through */
      }
    }
    if ([".txt", ".md"].includes(extension)) {
      try {
        return { text: await readFile(localPath, "utf8") };
      } catch {
        /* fall through */
      }
    }
    if (extension === ".pdf") {
      const text = await readPdfText(localPath);
      if (text) return { text };
    }
    if ([".docx", ".doc", ".rtf", ".odt"].includes(extension)) {
      const text = await readOfficeText(localPath);
      if (text) return { text };
    }
  }

  if (!fileUrl || !looksLikeTextArtifactUrl(fileUrl)) return null;

  try {
    const response = await fetch(toAuthenticatedFileUrl(fileUrl, accessKey));
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    const resolvedPath = getRemoteArtifactExtension(fileUrl, contentType);

    if (resolvedPath === ".pdf" || [".docx", ".doc", ".rtf", ".odt"].includes(resolvedPath)) {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "moodle-syllabus-"));
      const tempPath = path.join(tempDir, `artifact${resolvedPath}`);
      try {
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFileFs(tempPath, buffer);
        if (resolvedPath === ".pdf") {
          const text = await readPdfText(tempPath);
          if (text) return { text };
        }
        const text = await readOfficeText(tempPath);
        if (text) return { text };
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
      return null;
    }

    const body = await response.text();
    if (resolvedPath === ".txt" || resolvedPath === ".md") {
      return { text: body };
    }

    return { text: stripHtmlText(body) };
  } catch {
    return null;
  }
}

function getRemoteArtifactExtension(fileUrl: string, contentType: string) {
  const lowerType = contentType.toLowerCase();
  if (lowerType.includes("pdf")) return ".pdf";
  if (lowerType.includes("wordprocessingml")) return ".docx";
  if (lowerType.includes("msword")) return ".doc";
  if (lowerType.includes("rtf")) return ".rtf";
  if (lowerType.includes("opendocument")) return ".odt";
  if (lowerType.includes("markdown")) return ".md";
  if (lowerType.startsWith("text/plain")) return ".txt";
  if (lowerType.startsWith("text/html")) return ".html";

  try {
    const pathname = new URL(fileUrl).pathname;
    return path.extname(pathname).toLowerCase();
  } catch {
    return path.extname(fileUrl).toLowerCase();
  }
}

async function readPdfText(filePath: string) {
  try {
    const extracted = await execFileUtf8("/opt/homebrew/bin/pdftotext", ["-layout", filePath, "-"]);
    if (looksLikeUsefulPdfText(extracted)) {
      return extracted;
    }
  } catch {
    /* try lit fallback */
  }

  try {
    const extracted = await readWithLiteparse(filePath);
    return looksLikeUsefulPdfText(extracted) ? extracted : null;
  } catch {
    return null;
  }
}

async function readOfficeText(filePath: string) {
  try {
    const extracted = await execFileUtf8("/usr/bin/textutil", ["-convert", "txt", "-stdout", filePath]);
    if (looksLikeUsefulOfficeText(extracted)) {
      return extracted;
    }
  } catch {
    /* try lit fallback */
  }

  try {
    const extracted = await readWithLiteparse(filePath);
    return looksLikeUsefulOfficeText(extracted) ? extracted : null;
  } catch {
    return null;
  }
}

async function readWithLiteparse(filePath: string) {
  const parser = await getLiteParseInstance();
  const result = await parser.parse(filePath, true);
  return result.text.trim();
}

async function execFileUtf8(command: string, args: readonly string[]) {
  return await new Promise<string>((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", maxBuffer: 12 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout.trim());
    });
  });
}

async function safeStat(targetPath: string) {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

function buildInlineModuleTextPure(module: Module, sectionName?: string) {
  const parts = [sectionName, module.name, stripHtmlText(module.description || "")];

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
      parts.push(stripHtmlText(content.content));
    }
  }

  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");
}

function getLocalPath(
  file: Pick<CoreWSExternalFile, "filename" | "mimetype">,
  module: Module,
  course: SimpleCourse,
  syncFolder?: string,
) {
  return getAnalysisFilePath(file, module, course, syncFolder);
}

function buildFailedPayload(scope: CourseScope, error: string): SyllabusAnalysisPayload {
  const ts = new Date().toISOString();
  return {
    selectedArtifact: {
      scopedModuleId: scope.id,
      courseId: scope.mergedCourse.id,
      moduleId: 0,
      moduleName: scope.title,
      modname: "unknown",
    },
    parsedSyllabus: { components: [] },
    sections: [],
    unassignedMoodleRows: [],
    workbookRowsUsed: [],
    fingerprint: hashAnalysisInputs({ scopeId: scope.id, error }),
    status: "failed",
    error,
    createdAt: ts,
    updatedAt: ts,
  };
}

function buildSyntheticArtifact(scope: CourseScope): SelectedSyllabusArtifact {
  return {
    identity: {
      scopedModuleId: scope.id,
      courseId: scope.mergedCourse.id,
      moduleId: 0,
      moduleName: scope.title,
      modname: "synthetic",
    },
    score: 0,
    reasons: ["synthetic-fallback"],
    module: {
      id: 0,
      name: scope.title,
      modname: "label",
      url: "",
      instance: 0,
    } as Module,
    course: scope.mergedCourse,
    sectionName: "Synthetic",
    inlineText: "",
    modificationSignal: "synthetic",
    sourceLabel: scope.title,
    isPdf: false,
  };
}

function buildCachedFailurePayload(
  cachedBase: Pick<SyllabusAnalysisPayload, "selectedArtifact" | "fingerprint" | "createdAt" | "updatedAt">,
  error: string,
): SyllabusAnalysisPayload {
  return {
    ...cachedBase,
    parsedSyllabus: { components: [] } satisfies ParsedSyllabusDocument,
    sections: [],
    unassignedMoodleRows: [],
    workbookRowsUsed: [],
    status: "failed",
    error,
  };
}

function isIgnoredMoodleRow(
  label: string,
  rowGrade: string,
  rowRange: string,
  moduleContext?: {
    name: string;
    modname: string;
    purpose: string | undefined;
    sectionName: string;
  },
) {
  const normalized = normalizeLabel([label, moduleContext?.name, moduleContext?.sectionName].filter(Boolean).join(" "));
  const rawGrade = normalizeLabel(`${rowGrade} ${rowRange}`);
  return (
    normalized === "course total" ||
    normalized.includes("kurzus osszegezve") ||
    normalized.includes("course total") ||
    /\b(attendance|announcement)\b/.test(normalized) ||
    isGenericAdministrativeUploadLabel(normalizeLabel(label)) ||
    label.trim().endsWith("?") ||
    /\byes\b.*\bno\b/.test(rawGrade) ||
    moduleContext?.purpose === "administration" ||
    moduleContext?.purpose === "communication"
  );
}

function isAuxiliaryMoodleRow(
  label: string,
  kind: string,
  raw: number | null,
  max: number | null,
  moduleContext?: {
    name: string;
    modname: string;
    purpose: string | undefined;
    sectionName: string;
  },
) {
  const blob = normalizeLabel([label, moduleContext?.name, moduleContext?.sectionName].filter(Boolean).join(" "));
  if (/\bmock test\b/.test(blob) || /\bdoes not cover all domains\b/.test(blob)) return true;
  if (/\b(retake|makeup|make up|make-up)\b/.test(blob)) return true;
  if (/\bfor absentees?\b/.test(blob)) return true;
  if (/\bpractice\b/.test(blob) && /\b(midterm|exam|test|quiz|mock)\b/.test(blob)) return true;
  if (/\binteractive\b/.test(blob) && /\b(video|content)\b/.test(blob) && raw == null) return true;
  if (/\bh5p\b/.test(blob) && raw == null) return true;
  if (kind === "comprehensive_exam" && raw == null) return true;
  if (kind === "assignment" && /^hw(?:\d+)?[\s_-]/i.test(label.trim()) && max === 100) return true;
  if (/\breview\b/.test(blob) && kind !== "assignment") return true;
  return false;
}

function isGenericAdministrativeUploadLabel(normalized: string) {
  if (!/\b(upload|submission page|feltolto felulet|feltoltesi felulet|beadas|beadasa|feltoltese)\b/.test(normalized)) {
    return false;
  }
  if (/^upload your home task$/.test(normalized)) return true;

  const tokenCount = normalized.split(" ").filter(Boolean).length;
  const hasSpecificSignal =
    /\b(task|deliverable|project|homework|exam|reflection|presentation|assignment|report|quiz|midterm|final)\b/.test(
      normalized,
    ) ||
    /\b(prezentacio|feladat|projekt|vizsga|beadando|dolgozat)\b/.test(normalized) ||
    /\b\d+\b/.test(normalized);

  return (tokenCount <= 4 && !hasSpecificSignal) || /\bfeltolto felulet\b|\bfeltoltesi felulet\b/.test(normalized);
}

function isCategoryLikeRow(itemClass: string | undefined, href: string | undefined) {
  return !href && /\bcategory\b/i.test(itemClass || "");
}

function looksLikeUsefulPdfText(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 120) return false;

  const signalTerms = /(assessment|grading|grade conversion|excellent|satisfactory|jeles|megfelelt|pont|points)/i;
  return signalTerms.test(trimmed) || trimmed.length >= 500;
}

function looksLikeUsefulOfficeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 80;
}

async function getLiteParseInstance() {
  if (!liteParseInstancePromise) {
    liteParseInstancePromise = import("@llamaindex/liteparse").then(({ LiteParse }) => {
      return new LiteParse({
        outputFormat: "text",
        ocrLanguage: ["eng", "hun"],
      });
    });
  }

  return await liteParseInstancePromise;
}
