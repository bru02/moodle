import type { ScopedRenderedSection } from "@moodle/core";

import { pickBestSyllabusCandidate } from "./logic";
import { SelectedSyllabusArtifact } from "./types";
import { buildInlineModuleText, getFileSortScore, getSyllabusArtifactScore, getSyncedLocalPath } from "./utils";

export function selectSyllabusArtifact(sections: readonly ScopedRenderedSection[]) {
  const candidates: SelectedSyllabusArtifact[] = [];

  for (const section of sections) {
    for (const scopedModule of section.modules) {
      const { module, course } = scopedModule;
      const inlineText = buildInlineModuleText(module, section.name);
      const moduleScore = getSyllabusArtifactScore(module, section.name);

      const files = module.contents
        ?.filter((content) => content.type === "file")
        .toSorted((left, right) => getFileSortScore(right) - getFileSortScore(left));

      if (files?.length) {
        for (const file of files) {
          const { score, reasons } = getSyllabusArtifactScore(module, section.name, file);
          const localPath = getSyncedLocalPath(file, module, course);
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
            score,
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
        score: moduleScore.score + (inlineText.length > 80 ? 4 : 0),
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

  return pickBestSyllabusCandidate(candidates);
}
