import { MoodleHtml } from "@/components/moodle-html";

import { FactSection, formatCompletionState, formatStatusLabel, getFactRow } from "../shared";
import type { ModuleDetailProps } from "../types";

export function ForumDetail({ module }: Pick<ModuleDetailProps, "module">) {
  const rows = [
    getFactRow("Type", "Discussion"),
    getFactRow("Availability", module.module.uservisible ? "Visible" : "Hidden"),
    getFactRow("Completion", formatCompletionState(module.module.completiondata?.state)),
    getFactRow("Purpose", module.module.purpose ? formatStatusLabel(module.module.purpose) : undefined),
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <FactSection
      title="Forum"
      rows={rows}
      description={
        module.module.description ? (
          <MoodleHtml html={module.module.description} baseUrl={module.module.url} contents={module.module.contents} variant="secondary" />
        ) : undefined
      }
      emptyCopy="Forum details are only available in Moodle."
    />
  );
}
