import { MoodleHtml } from "@/components/moodle-html";

import { FactSection, formatModuleKind, getFactRow } from "../shared";
import type { ModuleDetailProps } from "../types";

export function GenericModuleDetail({ module }: Pick<ModuleDetailProps, "module">) {
  return (
    <FactSection
      title={formatModuleKind(module.module.modname)}
      rows={[
        getFactRow("Type", formatModuleKind(module.module.modname)),
        getFactRow("Visibility", module.module.uservisible ? "Visible" : "Hidden"),
      ].filter((item): item is { label: string; value: string } => Boolean(item))}
      description={
        module.module.description ? (
          <MoodleHtml html={module.module.description} baseUrl={module.module.url} contents={module.module.contents} variant="secondary" />
        ) : undefined
      }
      emptyCopy="No additional details are available in-app for this module type yet."
    />
  );
}
