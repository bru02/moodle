import { MoodleHtml } from "@/components/moodle-html";

import { ReadableTextBlock } from "../shared";
import type { ModuleDetailProps } from "../types";

export function LabelDetail({ module }: Pick<ModuleDetailProps, "module">) {
  return (
    <ReadableTextBlock
      title="Note"
      content={
        module.module.description ? (
          <MoodleHtml
            html={module.module.description}
            baseUrl={module.module.url}
            contents={module.module.contents}
            variant="secondary"
          />
        ) : undefined
      }
      emptyCopy="No extra note content is available for this item."
    />
  );
}
