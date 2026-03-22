import type { SimpleCourse } from "@moodle/core";

import { stripHTML } from "../helpers";
import { getFilePath, pdfify } from "../helpers/files";
import { CoreWSExternalFile, Module } from "../types";
export { getFileSortScore, getSyllabusArtifactScore } from "./scoring";

export function buildInlineModuleText(module: Module, sectionName?: string) {
  const parts = [sectionName, module.name, stripHTML(module.description || "")];

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
      parts.push(stripHTML(content.content));
    }
  }

  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function getSyncedLocalPath(
  file: Pick<CoreWSExternalFile, "filename" | "mimetype">,
  module: Module,
  course: SimpleCourse,
) {
  const path = getFilePath(file, module, course);
  if (file.mimetype && canUseConvertedPdf(file.mimetype)) {
    return pdfify(path);
  }
  return path;
}

function canUseConvertedPdf(mimetype?: string) {
  return mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}
