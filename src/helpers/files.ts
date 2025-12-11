import { randomUUID } from "crypto";
import { ReadStream } from "fs";
import { join } from "path";
import { sanitize } from "sanitize-filename-ts";
import { preferences } from ".";
import { getUserSync } from "../client";
import { CoreWSExternalFile, Course, FilePath, Module } from "../types";

export function handleFileUrl(url: string) {
  const { accessKey } = getUserSync()!;

  if (accessKey) {
    url = url.replace(/(\/webservice)?\/pluginfile\.php/g, `/tokenpluginfile.php/${accessKey}`);
  }

  url = url.replaceAll("?forcedownload=1", "");

  if (/generated\/course\.svg$/.test(url)) {
    return `https://tune.toldy.me/svg?u=${encodeURIComponent(url)}`;
  }

  return url;
}

export function pdfify(path: string) {
  return path.replace(/\.[^/.]+$/, ".pdf");
}

export function getCourseFolder(course: Course) {
  return join(preferences.sync_folder!, sanitize(course.displayname));
}

export function getModuleFolder(course: Course, module: Module) {
  const courseDir = getCourseFolder(course);
  const moduleDir = sanitize(module.name);
  return join(courseDir, moduleDir);
}

export function getFilePath(content: Pick<CoreWSExternalFile, "filename">, module: Module, course: Course): FilePath {
  const courseDir = ["folder", "assign"].includes(module.modname)
    ? getModuleFolder(course, module)
    : getCourseFolder(course);
  const fileName = sanitize(content.filename ?? module.name);
  return join(courseDir, fileName);
}

const ppt = () => `https://pptcs.officeapps.live.com/document/export/pdf?input=pptx&keepPDFProtection=true`;

const conversionUrls = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": () =>
    `https://wordcs.officeapps.live.com/wordauto/wordautomation.svc/rest/ConvertFileREST?${new URLSearchParams({
      correlationId: `{${randomUUID().toUpperCase()}}`,
      inputFormat: "DOCX",
      outputFormat: "PDF",
      endpointName: "Mac",
      isFileUncompressed: "true",
    })}`,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ppt,
  "application/vnd.ms-powerpoint": ppt,
};

export function convertToPdf(format: keyof typeof conversionUrls, body: ReadStream | ReadableStream) {
  return fetch(conversionUrls[format](), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(format !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ? {
            "X-ClientCorrelationId": `{${randomUUID().toUpperCase()}}`,
          }
        : {}),
    },
    body,
    duplex: "half",
  });
}

export function canConvert(mimeType?: string): mimeType is keyof typeof conversionUrls {
  return !!mimeType && mimeType in conversionUrls;
}

export function checkFileSize(filesize: number) {
  const maxBytes = +preferences.sync_max_size * 1024 * 1024;
  if (!maxBytes || filesize <= 0) {
    return false;
  }
  return filesize > maxBytes;
}
