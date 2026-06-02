#!/usr/bin/env bun
import initLiteParseWasm, { LiteParse } from "@llamaindex/liteparse-wasm";
import { decode } from "html-entities";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import yauzl from "yauzl";

type RowHit = {
  source: string;
  title: string;
  header: string[];
  row: string[];
};

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg, index, all) =>
    arg.startsWith("--") ? [[arg.slice(2), all[index + 1]]] : [],
  ),
);
const syncDir = args["sync-dir"] ?? "tmp/course-grades-sync";
const out = args.out ?? join(syncDir, "llm-course-context.md");
const neptun = (args.neptun ?? (await json("sync.json")).username).toLowerCase();
const wasm = args.wasm ?? findWasm();

await initLiteParseWasm({ module_or_path: await readFile(wasm) });
const parser = new LiteParse({ ocrEnabled: false, outputFormat: "text", quiet: true });

let markdown = `# Course Grade Context\n\nNeptun: ${neptun}\n\n`;
for (const group of groupCourseDirs(await courseDirs())) {
  markdown += `## ${group.title}\n\n`;
  markdown += `Courses: ${group.dirs.map((dir) => dir.name).join(" | ")}\n\n`;
  markdown += await gradebookMarkdown(group.dirs);
  markdown += await neptunRowsMarkdown(group.dirs);
  markdown += await gradingRulesMarkdown(group.dirs);
}

await writeFile(out, markdown);
console.log(`Wrote ${out}`);

async function json(path: string) {
  return JSON.parse(await readFile(join(syncDir, path), "utf8"));
}

async function courseDirs() {
  const dirs = (await readdir(syncDir, { withFileTypes: true })).filter(
    (dirent) => dirent.isDirectory() && /^\d+-/.test(dirent.name),
  );
  return await Promise.all(
    dirs.map(async (dirent) => ({
      dir: dirent.name,
      path: join(syncDir, dirent.name),
      course: await json(join(dirent.name, "course.json")),
      name: (await json(join(dirent.name, "course.json"))).displayname as string,
    })),
  );
}

function groupCourseDirs(dirs: Awaited<ReturnType<typeof courseDirs>>) {
  const groups = new Map<string, typeof dirs>();
  for (const dir of dirs) {
    const title = dir.name
      .replace(/\s+(Előadás|Gyakorlat)\s*\([^)]*\)\s*$/i, "")
      .replace(/\s+METACOURSE\s*\([^)]*\)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    groups.set(title, [...(groups.get(title) ?? []), dir]);
  }
  return [...groups.entries()]
    .map(([title, groupedDirs]) => ({ title, dirs: groupedDirs }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

async function gradebookMarkdown(dirs: Awaited<ReturnType<typeof courseDirs>>) {
  let md = "### Moodle Grade Rows\n\n";
  for (const dir of dirs) {
    const grades = await json(join(dir.dir, "grades.json")).catch(() => undefined);
    const rows = grades?.tables?.[0]?.tabledata ?? [];
    const renderedRows: string[] = [];
    for (const row of rows) {
      const item = plain(row.itemname?.content ?? row.leader?.content);
      const grade = plain(String(row.grade?.content ?? "").replace(/\bGrade analysis\b/g, ""));
      const range = plain(row.range?.content);
      const percentage = plain(row.percentage?.content);
      if (isSuperfluousGradeRow({ item, grade, range, percentage })) continue;
      renderedRows.push(
        `| ${escape(item)} | ${escape(grade)} | ${escape(range)} | ${escape(percentage)} |`,
      );
    }
    if (renderedRows.length === 0) continue;
    md += `#### ${dir.name}\n\n| Item | Grade | Range | Percentage |\n|---|---:|---:|---:|\n${renderedRows.join("\n")}\n\n`;
  }
  return md;
}

async function neptunRowsMarkdown(dirs: Awaited<ReturnType<typeof courseDirs>>) {
  const hits: RowHit[] = [];
  for (const dir of dirs) {
    const files = await listFiles(dir.path);
    const meta = new Map(
      (await json(join(dir.dir, "files.json")).catch(() => [])).map((file: any) => [
        basename(file.path),
        file.moduleName ?? file.filename,
      ]),
    );
    for (const file of files) {
      if ((await stat(file)).size > 8 * 1024 * 1024) continue;
      const rows = await rowsFromFile(file).catch(() => []);
      for (const hit of rowsContainingNeptun(rows)) {
        hits.push({
          source: relative(syncDir, file),
          title: String(meta.get(basename(file)) ?? basename(file)),
          ...hit,
        });
      }
    }
  }

  let md = "### Rows Containing This Neptun Code\n\n";
  if (hits.length === 0) return `${md}No rows found.\n\n`;
  for (const hit of hits) {
    md += `#### ${escape(hit.title)}\n\n`;
    md += `Source: \`${hit.source}\`\n\n`;
    md += renderHitTable(hit);
  }
  return md;
}

async function gradingRulesMarkdown(dirs: Awaited<ReturnType<typeof courseDirs>>) {
  const hits: Array<{ source: string; title: string; text: string }> = [];
  for (const dir of dirs) {
    const contents = await json(join(dir.dir, "contents.json")).catch(() => []);
    for (const section of contents) {
      for (const module of section.modules ?? []) {
        const text = plain([module.name, module.description].filter(Boolean).join(" "));
        if (isLikelyGradingRuleSource(module.name, text)) {
          hits.push({
            source: `${dir.dir}/module/${module.name}`,
            title: module.name,
            text: text.slice(0, 1000),
          });
        }
      }
    }

    for (const file of await listFiles(dir.path)) {
      const filename = basename(file);
      if (!isLikelyGradingRuleFilename(filename)) continue;
      if ((await stat(file)).size > 8 * 1024 * 1024) continue;
      const text = plain(await fileText(file).catch(() => ""));
      if (!isGradeScaleText(text)) continue;
      hits.push({
        source: relative(syncDir, file),
        title: filename,
        text: text.slice(0, 1200),
      });
    }
  }

  let md = "### Grading Rules / Syllabus Sources\n\n";
  if (hits.length === 0) return `${md}No likely grading-rule source found.\n\n`;
  for (const hit of hits.slice(0, 12)) {
    md += `#### ${escape(hit.title)}\n\nSource: \`${hit.source}\`\n\n${escape(hit.text)}\n\n`;
  }
  return md;
}

async function rowsFromFile(path: string): Promise<string[][]> {
  const ext = extname(path).toLowerCase();
  if (ext === ".xlsx") return xlsxRows(path);
  if (ext === ".pdf") return looseRows(await fileText(path));
  if ([".html", ".htm", ".txt", ".csv", ".md"].includes(ext)) {
    const text = await readFile(path, "utf8");
    return htmlRows(text).length > 0 ? htmlRows(text) : looseRows(text);
  }
  return [];
}

async function fileText(path: string) {
  const ext = extname(path).toLowerCase();
  if (ext === ".pdf") return (await parser.parse(await readFile(path))).text;
  if ([".html", ".htm", ".txt", ".csv", ".md"].includes(ext)) {
    return await readFile(path, "utf8");
  }
  return "";
}

function rowsContainingNeptun(rows: string[][]) {
  const hits: Array<{ header: string[]; row: string[] }> = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index].map(plain);
    if (!row.some((value) => value.toLowerCase().includes(neptun))) continue;
    hits.push({ header: headerFor(rows, index), row });
  }
  return hits;
}

function headerFor(rows: string[][], index: number) {
  let best: string[] = [];
  let bestScore = 0;
  for (let i = index - 1; i >= Math.max(0, index - 50); i--) {
    const row = rows[i].map(plain);
    const text = row.join(" ");
    const score =
      Number(/nept|code/i.test(text)) * 4 +
      Number(/sum|grade|point|pont|score|eredmény/i.test(text)) * 3 +
      Number(/mt|exam|quiz|group|presence|attendance/i.test(text)) * 2 +
      Number(row.length >= rows[index].length) * 1;
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  if (bestScore > 0) return best;
  return rows[Math.max(0, index - 1)]?.map(plain) ?? [];
}

function htmlRows(html: string) {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) =>
      [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
        plain(cell[1]),
      ),
    )
    .filter((row) => row.some(Boolean));
}

function looseRows(text: string) {
  return plain(text)
    .replace(/\s+(?=\d+\s+[a-z0-9]{6}\b)/gi, "\n")
    .split(/\r?\n|(?<=\s)\/(?=\s)/)
    .map((line) => [line.trim()])
    .filter((row) => row[0]);
}

async function xlsxRows(path: string) {
  const entries = await unzip(path);
  const shared = [...(entries.get("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(
    (match) => plain([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")),
  );
  return [...entries.entries()]
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .flatMap(([, xml]) =>
      [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) =>
        [...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map((cellMatch) => {
          const type = cellMatch[1].match(/\bt="([^"]+)"/)?.[1];
          const value = cellMatch[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
          return type === "s" ? (shared[Number(value)] ?? "") : plain(value);
        }),
      ),
    );
}

function unzip(path: string) {
  return new Promise<Map<string, string>>((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const entries = new Map<string, string>();
      zip.readEntry();
      zip.on("entry", (entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(entries));
      zip.on("error", reject);
    });
  });
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(path)));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

function findWasm() {
  return ["apps/raycast/assets/liteparse_wasm_bg.wasm", "../../apps/raycast/assets/liteparse_wasm_bg.wasm"].find(
    (path) => Bun.file(path).size > 0,
  )!;
}

function plain(value: unknown) {
  return decode(String(value ?? "").replace(/<[^>]+>/g, " "))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cell(value: unknown) {
  return escape(plain(value));
}

function gradeCell(value: unknown) {
  return cell(String(value ?? "").replace(/\bGrade analysis\b/g, ""));
}

function isSuperfluousGradeRow(row: {
  item: string;
  grade: string;
  range: string;
  percentage: string;
}) {
  if (![row.item, row.grade, row.range, row.percentage].some(Boolean)) return true;
  if (row.grade === "-" && row.percentage === "-") return true;
  if (
    !row.grade &&
    !row.range &&
    !row.percentage &&
    !/assignment|quiz|exam|midterm|homework|project|presentation|test|zh|pont|task|feladat/i.test(row.item)
  ) {
    return true;
  }
  if (/^(Aggregation|Calculated grade)\s+Course total$/i.test(row.item)) {
    return true;
  }
  if (/^Aggregation\b/i.test(row.item)) return true;
  return false;
}

function isLikelyGradingRuleFilename(filename: string) {
  return /syllabus|követel|requirement|grading|evaluation|assessment|project_description/i.test(
    filename,
  );
}

function isLikelyGradingRuleSource(title: string, text: string) {
  return (
    /syllabus|követel|requirement|grading|evaluation|assessment|course description/i.test(title) ||
    (/final grade|grading|assessment|követelmény|értékel/i.test(text) &&
      isGradeScaleText(text))
  );
}

function isGradeScaleText(text: string) {
  return (
    /jeles|közepes|elégséges|elégtelen|excellent|satisfactory|low pass|no pass|fail|ects/i.test(
      text,
    ) ||
    /final grade|grading scheme|assessment, grading|worth\s+\d+%|\d+%\s+of\s+(your\s+)?final grade|minimum .*points? to pass|at least .*points?/i.test(
      text,
    )
  );
}

function renderHitTable(hit: RowHit) {
  const header = hit.header.length > 0 ? hit.header : hit.row.map((_, index) => `Column ${index + 1}`);
  const row = [...hit.row];
  while (row.length < header.length) row.push("");
  while (header.length < row.length) header.push(`Column ${header.length + 1}`);

  if (header.length > 1 && header.length <= 20) {
    return [
      `| ${header.map(escape).join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
      `| ${row.map(escape).join(" | ")} |`,
      "",
    ].join("\n");
  }

  const cells = hit.row.join(" ").split(/\s+/).filter(Boolean);
  return [
    hit.header.length > 0 ? `Titlebar: ${escape(hit.header.join(" | "))}\n` : "",
    `| ${cells.map((_, index) => `Column ${index + 1}`).join(" | ")} |`,
    `| ${cells.map(() => "---").join(" | ")} |`,
    `| ${cells.map(escape).join(" | ")} |`,
    "",
  ].join("\n");
}

function escape(value: unknown) {
  return String(value ?? "").replaceAll("|", "\\|");
}
