import type { CoreCourseGetContentsWSModule } from "@moodle/core";
import { handleMoodleFileUrl } from "@moodle/core";
import { router, type Href } from "expo-router";

import { openExternalUrl } from "@/lib/browser";
import { recordCourseEngagement } from "@/lib/course-activity";
import { previewRemoteDocument } from "@/lib/document-preview";
import { buildAutologinRedirectUrl, fetchUrlModuleExternalUrl } from "@/lib/moodle-client";
import type { MoodleSession } from "@/lib/moodle-types";

export function shouldOpenModuleDirectly(module: CoreCourseGetContentsWSModule) {
  return module.modname === "resource" || module.modname === "url";
}

export async function openModule(input: {
  accountId: string;
  courseId: string;
  contentId: string;
  module: CoreCourseGetContentsWSModule;
  siteOrigin?: string;
  session: MoodleSession | null;
}) {
  const directTarget = await getDirectModuleTarget(input);
  if (directTarget) {
    await recordCourseEngagement({
      accountId: input.accountId,
      scopeId: input.courseId,
      source: "direct-module-launch",
    });
    if (directTarget.kind === "resource") {
      await previewRemoteDocument({
        url: directTarget.url,
        fileName: directTarget.fileName,
        mimeType: directTarget.mimeType,
      });
    } else {
      await openExternalUrl(directTarget.url);
    }
    return;
  }

  router.push({
    pathname: "/courses/[courseId]/content/[contentId]",
    params: { courseId: input.courseId, contentId: input.contentId },
  } as unknown as Href);
  void recordCourseEngagement({
    accountId: input.accountId,
    scopeId: input.courseId,
    source: "course-module",
  });
}

export async function getDirectModuleTarget(input: {
  courseId?: string;
  module: CoreCourseGetContentsWSModule;
  siteOrigin?: string;
  session: MoodleSession | null;
}) {
  const { courseId, module, siteOrigin, session } = input;
  if (!session) {
    return null;
  }

  if (module.modname === "resource") {
    const file = module.contents?.[0];
    const fileUrl = file?.fileurl;
    if (fileUrl) {
      return {
        kind: "resource" as const,
        url: handleMoodleFileUrl({
          url: fileUrl,
          accessKey: session.accessKey,
          siteOrigin,
        }),
        fileName: file?.filename,
        mimeType: file?.mimetype,
      };
    }
  }

  if (module.modname === "url" && siteOrigin && module.url) {
    const moduleCourseId = Number(courseId);
    const resolvedExternalUrl =
      Number.isFinite(moduleCourseId) && moduleCourseId > 0
        ? await fetchUrlModuleExternalUrl({
            siteOrigin,
            session,
            courseId: moduleCourseId,
            moduleId: module.id,
            moduleInstanceId: module.instance,
          }).catch(() => undefined)
        : undefined;
    const destinationUrl = resolvedExternalUrl ?? module.contents?.[0]?.fileurl ?? module.url;
    return {
      kind: "url" as const,
      url: await buildAutologinRedirectUrl({
        siteOrigin,
        session,
        destinationUrl,
      }),
    };
  }

  return null;
}
