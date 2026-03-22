import { mkdir, rename, stat, utimes, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import type { SimpleCourse } from "@moodle/core";
import { sanitize } from "sanitize-filename-ts";

import { CoreWSExternalFile, Module } from "../types";

const ANALYSIS_SYNC_DIR = path.join(os.homedir(), ".moodle-raycast", "analysis-sync");

export function getAnalysisSyncRoot(syncFolder?: string) {
  return syncFolder || ANALYSIS_SYNC_DIR;
}

export function getAnalysisCourseFolder(course: Pick<SimpleCourse, "displayname">, syncFolder?: string) {
  return path.join(getAnalysisSyncRoot(syncFolder), sanitize(course.displayname));
}

export function getAnalysisFilePath(
  file: Pick<CoreWSExternalFile, "filename">,
  module: Pick<Module, "modname" | "name">,
  course: Pick<SimpleCourse, "displayname">,
  syncFolder?: string,
) {
  const courseDir = ["folder", "assign", "book"].includes(module.modname)
    ? path.join(getAnalysisCourseFolder(course, syncFolder), sanitize(module.name))
    : getAnalysisCourseFolder(course, syncFolder);
  const filename = sanitize(file.filename ?? module.name);
  return path.join(courseDir, filename);
}

export async function ensureAnalysisFileOnDisk(params: {
  file: Pick<CoreWSExternalFile, "filename" | "fileurl" | "filesize" | "timemodified" | "mimetype">;
  module: Pick<Module, "modname" | "name">;
  course: Pick<SimpleCourse, "displayname">;
  accessKey?: string;
  syncFolder?: string;
}) {
  const { file, module, course, accessKey, syncFolder } = params;
  const targetPath = getAnalysisFilePath(file, module, course, syncFolder);
  const availableLocalPath = await findAvailableLocalPath(targetPath, file.mimetype);
  if (availableLocalPath && (await isFreshEnough(availableLocalPath, file))) {
    return availableLocalPath;
  }

  if (!file.fileurl) {
    return availableLocalPath ?? targetPath;
  }

  const response = await fetch(toAuthenticatedFileUrl(file.fileurl, accessKey));
  if (!response.ok) {
    return availableLocalPath ?? targetPath;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });

  const tempPath = `${targetPath}.part`;
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(tempPath, buffer);
  await rename(tempPath, targetPath);

  if (typeof file.timemodified === "number" && Number.isFinite(file.timemodified)) {
    const modifiedAt = new Date(file.timemodified * 1000);
    await utimes(targetPath, modifiedAt, modifiedAt).catch(() => undefined);
  }

  return targetPath;
}

async function findAvailableLocalPath(targetPath: string, mimetype?: string) {
  for (const candidate of buildCandidatePaths(targetPath, mimetype)) {
    try {
      const details = await stat(candidate);
      if (details.isFile()) {
        return candidate;
      }
    } catch {
      /* keep looking */
    }
  }

  return null;
}

function buildCandidatePaths(targetPath: string, mimetype?: string) {
  const candidates = [targetPath];

  if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    candidates.push(targetPath.replace(/\.[^/.]+$/, ".pdf"));
  }

  return [...new Set(candidates)];
}

async function isFreshEnough(
  filePath: string,
  remoteFile: Pick<CoreWSExternalFile, "filesize" | "timemodified" | "mimetype">,
) {
  try {
    const details = await stat(filePath);
    if (!details.isFile()) return false;
    if (
      typeof remoteFile.filesize === "number" &&
      /\.pdf$/i.test(filePath) === false &&
      details.size !== remoteFile.filesize
    ) {
      return false;
    }

    if (typeof remoteFile.timemodified === "number") {
      const remoteMtimeMs = remoteFile.timemodified * 1000;
      if (details.mtimeMs + 1_000 < remoteMtimeMs) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function toAuthenticatedFileUrl(url: string, accessKey?: string) {
  if (!accessKey) {
    return url.replaceAll("?forcedownload=1", "");
  }

  return url
    .replace(/(\/webservice)?\/pluginfile\.php/g, `/tokenpluginfile.php/${accessKey}`)
    .replaceAll("?forcedownload=1", "");
}
