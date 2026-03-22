import { readFile, writeFile } from "fs/promises";

import { runSyllabusAnalysisPipeline } from "./pipeline";

async function main() {
  const inputPath = getArgValue("--input");
  const outputPath = getArgValue("--output");
  const input = inputPath ? await readFile(inputPath, "utf8") : await readStdin();
  const payload = JSON.parse(input) as Parameters<typeof runSyllabusAnalysisPipeline>[0];
  const result = await runSyllabusAnalysisPipeline(payload);
  const serialized = `${JSON.stringify(result)}\n`;

  if (outputPath) {
    await writeFile(outputPath, serialized, "utf8");
    return;
  }

  process.stdout.write(serialized);
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return;
  return process.argv[index + 1];
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
