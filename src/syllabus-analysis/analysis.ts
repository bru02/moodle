import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, resolve } from "path";

import { getUser } from "../client";
import { ScopedRenderedSection } from "../course-content";
import { CourseScope } from "../course-scope";
import { preferences } from "../helpers/preferences";
import { CoreGradesGetUserGradesTableWSResponse } from "../types/grade";
import { buildAnalysisFingerprintData, runSyllabusAnalysisPipeline } from "./pipeline";

export async function runSyllabusAnalysis(params: {
  scope: CourseScope;
  sections: readonly ScopedRenderedSection[];
  gradeData: readonly CoreGradesGetUserGradesTableWSResponse[];
  identifiers: readonly string[];
}) {
  const user = await getUser().catch(() => null);
  const payload = {
    ...params,
    options: {
      accessKey: user?.accessKey,
      geminiApiKey: preferences.gemini_api_key,
      siteUrl: preferences.site_url,
      syncFolder: preferences.sync_folder,
    },
  };

  return runSyllabusAnalysisCli(payload);
}

export async function buildAnalysisFingerprint(params: {
  scope: CourseScope;
  sections: readonly ScopedRenderedSection[];
  gradeData: readonly CoreGradesGetUserGradesTableWSResponse[];
  identifiers: readonly string[];
}) {
  return buildAnalysisFingerprintData({
    scope: params.scope,
    sections: params.sections,
    gradeData: params.gradeData,
    options: {
      accessKey: undefined,
      siteUrl: preferences.site_url,
      syncFolder: preferences.sync_folder,
    },
  });
}

async function runSyllabusAnalysisCli(payload: Parameters<typeof runSyllabusAnalysisPipeline>[0]) {
  const projectRoot = resolve(__dirname, "..", "..");
  const cliPath = resolve(projectRoot, "src", "syllabus-analysis", "cli.ts");
  const tsxCliPath = resolve(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const nodeBin = process.execPath;
  const workspace = await mkdtemp(resolve(tmpdir(), "moodle-syllabus-analysis-"));
  const inputPath = resolve(workspace, "input.json");
  const outputPath = resolve(workspace, "output.json");

  await writeFile(inputPath, JSON.stringify(payload), "utf8");

  try {
    return await new Promise<Awaited<ReturnType<typeof runSyllabusAnalysisPipeline>>>(
      (resolvePromise, rejectPromise) => {
        const child = spawn(nodeBin, [tsxCliPath, cliPath, "--input", inputPath, "--output", outputPath], {
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            PATH: `${dirname(nodeBin)}${process.env.PATH ? `:${process.env.PATH}` : ""}`,
          },
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk: Buffer | string) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer | string) => {
          stderr += chunk.toString();
        });
        child.on("error", rejectPromise);
        child.on("close", (code) => {
          void (async () => {
            if (code !== 0) {
              rejectPromise(new Error(stderr.trim() || stdout.trim() || `CLI exited with code ${code ?? "unknown"}`));
              return;
            }

            try {
              const output = await readFile(outputPath, "utf8");
              resolvePromise(JSON.parse(output) as Awaited<ReturnType<typeof runSyllabusAnalysisPipeline>>);
            } catch (error) {
              rejectPromise(new Error(`Invalid CLI output: ${error instanceof Error ? error.message : String(error)}`));
            }
          })().catch(rejectPromise);
        });
      },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
}
