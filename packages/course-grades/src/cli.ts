#!/usr/bin/env bun
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadCredentialsFromFile } from "./credentials";
import { buildAnalysisBundle } from "./discovery";
import { syncCourseGradesData } from "./sync";

type CliArgs = {
  credentials?: string;
  output?: string;
  neptune?: string;
  courseId: number[];
  semester?: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.credentials) {
    throw new Error("Usage: course-grades --credentials <file> [--output <dir>]");
  }

  const outputDir = resolve(args.output ?? "tmp/course-grades-sync");
  const credentials = await loadCredentialsFromFile(args.credentials);
  const sync = await syncCourseGradesData({
    credentials,
    outputDir,
    neptuneCode: args.neptune,
    courseIds: args.courseId,
    semester: args.semester ?? "all",
  });
  const bundle = buildAnalysisBundle({
    sync,
    neptuneCode: args.neptune ?? sync.username,
  });
  await writeFile(
    join(outputDir, "analysis-bundle.json"),
    `${JSON.stringify(bundle, null, 2)}\n`,
  );
  await writeFile(join(outputDir, "llm-input.md"), bundle.llmInput);

  console.log(`Synced ${sync.courses.length} courses to ${outputDir}`);
  console.log(`Collected ${bundle.evidence.length} evidence items`);
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { courseId: [] };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--credentials" && next) {
      args.credentials = next;
      index++;
    } else if (arg === "--output" && next) {
      args.output = next;
      index++;
    } else if (arg === "--neptune" && next) {
      args.neptune = next;
      index++;
    } else if (arg === "--semester" && next) {
      args.semester = next;
      index++;
    } else if (arg === "--course-id" && next) {
      args.courseId.push(Number(next));
      index++;
    }
  }

  return args;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
