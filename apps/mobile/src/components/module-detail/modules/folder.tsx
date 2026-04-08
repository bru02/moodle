import { MoodleHtml } from "@/components/moodle-html";

import { FilesSection, formatBytes, formatFactDate, getFactRow, ModuleDetailCard } from "../shared";
import type { ModuleDetailProps } from "../types";

export function FolderDetail({ module }: Pick<ModuleDetailProps, "module">) {
  const rows = [
    getFactRow(
      "Files",
      typeof module.module.contentsinfo?.filescount === "number" ? String(module.module.contentsinfo.filescount) : undefined,
    ),
    getFactRow(
      "Total size",
      typeof module.module.contentsinfo?.filessize === "number" ? formatBytes(module.module.contentsinfo.filessize) : undefined,
    ),
    getFactRow("Updated", formatFactDate(module.module.contentsinfo?.lastmodified)),
    getFactRow("Type", "Folder"),
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <ModuleDetailCard
      title="Folder"
      rows={rows}
      description={
        module.module.description ? (
          <MoodleHtml html={module.module.description} baseUrl={module.module.url} contents={module.module.contents} variant="secondary" />
        ) : undefined
      }
      emptyCopy="Folder details are only available in Moodle."
    >
      <FilesSection title="Folder contents" files={module.module.contents ?? []} />
    </ModuleDetailCard>
  );
}
