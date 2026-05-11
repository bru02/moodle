import { randomUUID } from "crypto";
import { ReadStream } from "fs";
import { join } from "path";

import {
  handleMoodleFileUrl as handleMoodleFileUrlCore,
  type SimpleCourse,
} from "@moodle/core";
import { sanitize } from "sanitize-filename-ts";

import { getUserSync } from "../client";
import { CoreWSExternalFile, FilePath, Module } from "../types";
import { preferences } from "./preferences";

export function handleFileUrl(url: string) {
  return handleMoodleFileUrlCore({
    url,
    accessKey: getUserSync()?.accessKey,
    siteOrigin: getUserSync()?.siteOrigin,
  });
}

export function pdfify(path: string) {
  return path.replace(/\.[^/.]+$/, ".pdf");
}

export function getCourseFolder(course: Pick<SimpleCourse, "displayname">) {
  const baseDir = preferences.sync_folder;
  const courseName = sanitize(course.displayname);
  if (!baseDir) {
    return courseName;
  }
  return join(baseDir, courseName);
}

export function getModuleFolder(
  course: Pick<SimpleCourse, "displayname">,
  module: Module,
) {
  const courseDir = getCourseFolder(course);
  const moduleDir = sanitize(module.name);
  return join(courseDir, moduleDir);
}

export function getFilePath(
  content: Pick<CoreWSExternalFile, "filename">,
  module: Module,
  course: Pick<SimpleCourse, "displayname">,
): FilePath {
  const courseDir = ["folder", "assign", "book"].includes(module.modname)
    ? getModuleFolder(course, module)
    : getCourseFolder(course);
  const fileName = sanitize(content.filename ?? module.name);
  return join(courseDir, fileName);
}

const ppt = () =>
  `https://pptcs.officeapps.live.com/document/export/pdf?input=pptx&keepPDFProtection=true`;

const conversionUrls = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    () =>
      `https://wordcs.officeapps.live.com/wordauto/wordautomation.svc/rest/ConvertFileREST?${new URLSearchParams(
        {
          correlationId: `{${randomUUID().toUpperCase()}}`,
          inputFormat: "DOCX",
          outputFormat: "PDF",
          endpointName: "Mac",
          isFileUncompressed: "true",
        },
      )}`,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ppt,
  "application/vnd.ms-powerpoint": ppt,
};

export function convertToPdf(
  format: keyof typeof conversionUrls,
  body: ReadStream | ReadableStream,
  signal?: AbortSignal,
) {
  return fetch(conversionUrls[format](), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(format !==
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ? {
            "X-ClientCorrelationId": `{${randomUUID().toUpperCase()}}`,
          }
        : {}),
    },
    body: body as never,
    duplex: "half",
    signal: signal as never,
  });
}

export function canConvert(
  mimeType?: string,
): mimeType is keyof typeof conversionUrls {
  return !!mimeType && mimeType in conversionUrls;
}

export function checkFileSize(filesize: number) {
  const maxBytes = +preferences.sync_max_size * 1024 * 1024;
  if (!maxBytes || filesize <= 0) {
    return false;
  }
  return filesize > maxBytes;
}
