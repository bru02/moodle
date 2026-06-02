import {
  authenticateWithCredentials,
  authenticateWithToken,
  callMoodleWS,
  fetchCourseCatalog,
  handleMoodleFileUrl,
} from "@moodle/core";
import type {
  CoreCourseGetContentsWSResponse,
  CoreCourseModuleContentFile,
  CoreGradesGetUserGradesTableWSResponse,
} from "@moodle/core";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CourseGradesSyncOptions,
  CourseGradesSyncResult,
  SyncedMoodleFile,
} from "./types";

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const RAYCAST_SYNC_MODULE = "../../../apps/raycast/src/sync-engine";

type SyncFilesToDisk = (
  files: readonly (readonly [string, CoreCourseModuleContentFile])[],
  options?: {
    signal?: AbortSignal;
    resolveFileUrl?: (url: string) => string;
    onDownloadProgress?: (fileId: string, pct: number) => void;
    onConvertProgress?: (fileId: string, pct: number) => void;
  },
) => Promise<void>;

export async function syncCourseGradesData(
  options: CourseGradesSyncOptions,
): Promise<CourseGradesSyncResult> {
  log("Authenticating with Moodle");
  const session = await authenticate(options.credentials);
  log(
    `Authenticated as ${session.account.username ?? session.account.userId} on ${session.siteOrigin}`,
  );
  const outputDir = options.outputDir;
  await mkdir(outputDir, { recursive: true });

  const requestWS = <T>(
    service: string,
    requestParams?: Record<string, unknown>,
  ) =>
    callMoodleWS<T>({
      origin: session.siteOrigin,
      token: session.token,
      wsfunction: service,
      requestParams: requestParams as Record<string, string | number | boolean>,
    });

  log("Fetching course catalog");
  const catalog = await fetchCourseCatalog({
    requestWS,
    userId: session.account.userId,
    semester: options.semester ?? "all",
    merge: options.mergeCourses ?? false,
  });
  const selectedCourseIds = new Set(options.courseIds ?? []);
  const courses =
    selectedCourseIds.size === 0
      ? catalog.filteredCourses
      : catalog.filteredCourses.filter((course) => selectedCourseIds.has(course.id));
  log(`Selected ${courses.length} courses for sync`);

  const syncedCourses = [];
  for (const [index, course] of courses.entries()) {
    const label = `[${index + 1}/${courses.length}] ${course.displayname} (${course.id})`;
    log(`${label}: fetching contents`);
    const contents = await requestWS<CoreCourseGetContentsWSResponse>(
      "core_course_get_contents",
      { courseid: course.id },
    );
    log(`${label}: fetched ${countModules(contents)} modules`);
    log(`${label}: fetching grades`);
    const grades = await requestWS<CoreGradesGetUserGradesTableWSResponse>(
      "gradereport_user_get_grades_table",
      { courseid: course.id, userid: session.account.userId },
    ).catch((error: unknown) => {
      log(`${label}: grades unavailable (${errorMessage(error)})`);
      return undefined;
    });
    if (grades) log(`${label}: fetched grades`);
    const courseDir = join(outputDir, safeSegment(`${course.id}-${course.displayname}`));
    await mkdir(courseDir, { recursive: true });
    await writeJson(join(courseDir, "course.json"), course);
    await writeJson(join(courseDir, "contents.json"), contents);
    if (grades) await writeJson(join(courseDir, "grades.json"), grades);
    log(`${label}: downloading files`);
    const files = await downloadCourseFiles({
      contents,
      courseId: course.id,
      siteOrigin: session.siteOrigin,
      accessKey: session.accessKey,
      courseDir,
    });
    log(`${label}: downloaded ${files.length} files`);
    syncedCourses.push({ course, contents, grades, files });
  }

  const result = {
    syncedAt: new Date().toISOString(),
    siteOrigin: normalizeSiteOrigin(session.siteOrigin),
    userId: session.account.userId,
    username: session.account.username,
    courses: syncedCourses,
  };
  await writeJson(join(outputDir, "sync.json"), result);
  log(`Wrote sync metadata to ${join(outputDir, "sync.json")}`);
  return result;
}

async function authenticate(credentials: CourseGradesSyncOptions["credentials"]) {
  if (credentials.token) {
    return await authenticateWithToken({
      siteOrigin: credentials.siteOrigin,
      token: credentials.token,
      privateToken: credentials.privateToken,
    });
  }

  return await authenticateWithCredentials({
    siteOrigin: credentials.siteOrigin,
    username: credentials.username ?? "",
    password: credentials.password ?? "",
  });
}

async function downloadCourseFiles(input: {
  contents: CoreCourseGetContentsWSResponse;
  courseId: number;
  siteOrigin: string;
  accessKey?: string;
  courseDir: string;
}) {
  const files: SyncedMoodleFile[] = [];
  const filesDir = join(input.courseDir, "files");
  await mkdir(filesDir, { recursive: true });
  const queue: Array<readonly [string, CoreCourseModuleContentFile]> = [];

  for (const section of input.contents) {
    for (const module of section.modules) {
      for (const content of module.contents ?? []) {
        const sourceUrl = content.fileurl ?? content.content;
        if (!sourceUrl || content.type !== "file") continue;
        const filesize = content.filesize ?? 0;
        const filename = safeSegment(content.filename || module.name);
        const path = join(filesDir, `${module.id}-${filename}`);
        if (filesize > MAX_FILE_BYTES) {
          log(
            `Skipping file ${content.filename}: ${formatBytes(filesize)} is above 3 MB`,
          );
          continue;
        }
        queue.push([path, content]);
        files.push({
          courseId: input.courseId,
          moduleId: module.id,
          moduleName: module.name,
          sectionName: section.name,
          filename,
          sourceUrl,
          path,
          contentType: content.mimetype,
          bytes: filesize,
        });
      }
    }
  }

  log(`Queued ${queue.length} files at or below 3 MB`);
  const syncFilesToDisk = await loadRaycastSyncFilesToDisk();
  await syncFilesToDisk(queue, {
    resolveFileUrl: (url) =>
      handleMoodleFileUrl({
        url,
        siteOrigin: input.siteOrigin,
        accessKey: input.accessKey,
      }),
    onDownloadProgress: (fileId, pct) => {
      if (pct === 0 || pct >= 100) {
        log(`Download ${Math.round(pct)}%: ${fileId}`);
      }
    },
    onConvertProgress: (fileId, pct) => {
      if (pct === 0 || pct >= 100) {
        log(`PDF conversion ${Math.round(pct)}%: ${fileId}`);
      }
    },
  });
  await writeJson(join(input.courseDir, "files.json"), files);
  return files;
}

async function loadRaycastSyncFilesToDisk() {
  const mod = (await import(RAYCAST_SYNC_MODULE)) as unknown as {
    syncFilesToDisk: SyncFilesToDisk;
  };
  return mod.syncFilesToDisk;
}

function normalizeSiteOrigin(siteOrigin: string) {
  const trimmed = siteOrigin.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  return `https://${trimmed.replace(/\/$/, "")}`;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function safeSegment(value: string) {
  return value
    .replace(/[/:\\?%*"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function countModules(contents: CoreCourseGetContentsWSResponse) {
  return contents.reduce((total, section) => total + section.modules.length, 0);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function log(message: string) {
  console.log(`[course-grades] ${message}`);
}
