import { MoodleHtml } from "@/components/moodle-html";

import { ReadableTextBlock, useRemoteModuleHtml } from "../shared";
import type { ModuleDetailProps } from "../types";

export function PageDetail({ module }: Pick<ModuleDetailProps, "module">) {
  const pageContent = module.module.contents?.find((content) => content.filename === "index.html") ?? module.module.contents?.[0];
  const remoteHtml = useRemoteModuleHtml(pageContent);

  return (
    <ReadableTextBlock
      title="Page"
      content={
        remoteHtml.data ? (
          <MoodleHtml html={remoteHtml.data} baseUrl={pageContent?.fileurl} contents={module.module.contents} variant="secondary" />
        ) : undefined
      }
      isLoading={remoteHtml.isLoading}
      emptyCopy="Page content is only available in Moodle."
    />
  );
}
