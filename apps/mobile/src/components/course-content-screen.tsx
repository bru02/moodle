import { useFocusEffect } from "@react-navigation/native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { EmptyState } from "@/components/empty-state";
import { InsetGroup, NativeScrollPage } from "@/components/native-ui";
import { ModuleDetail } from "@/components/module-detail";
import { OpenInMoodleButton, formatModuleKind } from "@/components/module-detail/shared";
import { openExternalUrl } from "@/lib/browser";
import { previewRemoteDocument } from "@/lib/document-preview";
import { recordCourseEngagement } from "@/lib/course-activity";
import { getDirectModuleTarget, shouldOpenModuleDirectly } from "@/lib/module-navigation";
import { useCourseContentsQuery, useCourseScope } from "@/lib/moodle-queries";
import { useAppState } from "@/providers/app-provider";

export function CourseContentScreen() {
  const params = useLocalSearchParams<{ courseId?: string; contentId?: string }>();
  const courseId = typeof params.courseId === "string" ? params.courseId : "";
  const contentId = typeof params.contentId === "string" ? params.contentId : "";
  const scope = useCourseScope(courseId);
  const contentsQuery = useCourseContentsQuery(scope);
  const { activeAccount, accountSession } = useAppState();
  const hasOpenedDirectModuleRef = useRef(false);
  const session = activeAccount ? accountSession(activeAccount.id) : null;

  const module = useMemo(() => {
    const sections = contentsQuery.data?.sections ?? [];
    for (const section of sections) {
      for (const candidate of section.modules) {
        if (candidate.id === contentId) {
          return candidate;
        }
      }
    }
    return null;
  }, [contentId, contentsQuery.data?.sections]);

  useFocusEffect(
    useCallback(() => {
      if (!activeAccount || !scope || !module) return;
      void recordCourseEngagement({
        accountId: activeAccount.id,
        scopeId: scope.id,
        source: "course-module",
      });
    }, [activeAccount, module, scope]),
  );

  useEffect(() => {
    if (!scope || !module || !shouldOpenModuleDirectly(module.module) || hasOpenedDirectModuleRef.current) {
      return;
    }

    hasOpenedDirectModuleRef.current = true;
    void (async () => {
      try {
        const directTarget = await getDirectModuleTarget({
          courseId: scope.id,
          module: module.module,
          siteOrigin: activeAccount?.origin,
          session,
        });
        if (directTarget?.kind === "url") {
          await openExternalUrl(directTarget.url);
        } else if (directTarget?.kind === "resource") {
          await previewRemoteDocument({
            url: directTarget.url,
            fileName: directTarget.fileName,
            mimeType: directTarget.mimeType,
          });
        }
      } catch {
        hasOpenedDirectModuleRef.current = false;
      }
    })();
  }, [activeAccount?.origin, module, scope, session]);

  if (!scope) {
    return <EmptyState title="Content not found" description="Module not found." />;
  }

  if (contentsQuery.isLoading && !module) {
    return <EmptyState title="Loading content" />;
  }

  if (!module) {
    return <EmptyState title="Content not found" description="Module not found." />;
  }

  if (shouldOpenModuleDirectly(module.module)) {
    return (
      <>
        <Stack.Screen options={{ title: module.module.name }} />
        <NativeScrollPage>
          <EmptyState
            title={`Opening ${module.module.modname === "url" ? "link" : "resource"}`}
            description={module.module.modname === "url" ? "Opening in browser." : "Opening preview."}
          />
        </NativeScrollPage>
      </>
    );
  }

  const detailTitle = module.module.modname === "label" ? formatModuleKind(module.module.modname) : module.module.name;

  return (
    <>
      <Stack.Screen
        options={{
          title: detailTitle,
          headerRight: () => <OpenInMoodleButton scope={scope} module={module} />,
        }}
      />
      <NativeScrollPage>
        <InsetGroup style={{ padding: 16 }}>
          <ModuleDetail scope={scope} module={module} />
        </InsetGroup>
      </NativeScrollPage>
    </>
  );
}
