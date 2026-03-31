import { View } from "react-native";

import { MoodleHtml } from "@/components/moodle-html";

import { FactSection, FilesSection, formatBytes, formatFactDate, getFactRow, humanizeMimeType } from "../shared";
import type { ModuleDetailProps } from "../types";

export function ResourceDetail({ module }: Pick<ModuleDetailProps, "module">) {
  const file = module.module.contents?.[0];
  const rows = [
    getFactRow("Format", module.module.activitybadge?.badgecontent ?? humanizeMimeType(file?.mimetype)),
    getFactRow("Size", typeof file?.filesize === "number" ? formatBytes(file.filesize) : undefined),
    getFactRow(
      "Files",
      typeof module.module.contentsinfo?.filescount === "number" ? String(module.module.contentsinfo.filescount) : undefined,
    ),
    getFactRow("Updated", formatFactDate(module.module.contentsinfo?.lastmodified)),
    getFactRow("Download", module.module.downloadcontent ? "Available" : undefined),
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <View style={{ gap: 12 }}>
      <FactSection
        title="Resource"
        rows={rows}
        description={
          module.module.description ? (
            <MoodleHtml html={module.module.description} baseUrl={module.module.url} contents={module.module.contents} variant="secondary" />
          ) : undefined
        }
        emptyCopy="Resource details are only available in Moodle."
      />
      <FilesSection title="File" files={module.module.contents ?? []} />
    </View>
  );
}
