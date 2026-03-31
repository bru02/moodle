import { MoodleHtml } from "@/components/moodle-html";

import { FactSection, formatCompletionState, formatModuleKind, getFactRow } from "../shared";
import type { ModuleDetailProps } from "../types";

export function FeedbackDetail({ module }: Pick<ModuleDetailProps, "module">) {
  return (
    <FactSection
      title="Feedback"
      rows={[
        getFactRow("Type", formatModuleKind(module.module.modname)),
        getFactRow("Availability", module.module.uservisible ? "Visible" : "Hidden"),
        getFactRow("Completion", formatCompletionState(module.module.completiondata?.state)),
      ].filter((item): item is { label: string; value: string } => Boolean(item))}
      description={
        module.module.description ? (
          <MoodleHtml html={module.module.description} baseUrl={module.module.url} contents={module.module.contents} variant="secondary" />
        ) : undefined
      }
      emptyCopy="Feedback details are only available in Moodle."
    />
  );
}
