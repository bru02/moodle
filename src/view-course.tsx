import { List, useNavigation } from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthErrorDetail from "./components/AuthErrorDetail";
import WithHiddenItems from "./components/WithHiddenItems";
import {
  buildScopedSections,
  regroupCourseContentByVisibleModules,
  ScopedModule,
  ScopedRenderedSection,
} from "./course-content";
import CourseContext from "./course-context";
import { CourseScope } from "./course-scope";
import { getFilePath } from "./helpers/files";
import { getModuleListItemId } from "./helpers/modules";
import { useWSBatchQuery } from "./hooks/useWSQuery";
import LazyViewCourseGrades from "./lazy-view-course-grades";
import ListItems, { ModuleViewComponents } from "./mods";
import { getSyllabusCacheState, useSyllabusAnalysisCache } from "./syllabus-analysis/cache";
import SyllabusAnalysisContext from "./syllabus-analysis/context";
import { selectSyllabusArtifact } from "./syllabus-analysis/selector";
import { SyllabusArtifactIdentity } from "./syllabus-analysis/types";
import { useSync } from "./sync";
import { Module } from "./types";
import { Modname } from "./types/contents";

export default function ViewCourse({ scope, preselectItem }: { scope: CourseScope; preselectItem?: number }) {
  const {
    data: contentRows,
    isFetching,
    error,
    refetch,
  } = useWSBatchQuery(
    "core_course_get_contents",
    scope.courseIds.map((courseid) => ({ courseid })),
    {
      staleTime: 0,
    },
  );

  const scopedSections = useMemo(() => buildScopedSections(scope, contentRows), [contentRows, scope]);

  const files = useMemo(
    () =>
      scopedSections.flatMap((section) =>
        section.modules.flatMap(
          ({ module, course }) =>
            module.contents
              ?.filter(
                (f) => f.type === "file" && !(f.filename === "index.html" && ["page", "book"].includes(module.modname)),
              )
              .map((f) => [getFilePath(f, module, course), f] as const) ?? [],
        ),
      ),
    [scopedSections],
  );

  useSync(files);

  if (error) return <AuthErrorDetail error={error} onRetry={() => refetch()} />;

  if (!contentRows && isFetching) {
    return (
      <CourseContext value={{ scope, activeCourse: scope.mergedCourse }}>
        <List navigationTitle={scope.title} isLoading />
      </CourseContext>
    );
  }

  return (
    <CourseContext value={{ scope, activeCourse: scope.mergedCourse }}>
      <CourseContentContainer
        key={scope.id}
        scope={scope}
        isLoading={isFetching}
        content={scopedSections}
        preselectItem={preselectItem}
      />
    </CourseContext>
  );
}

type CourseContentContainerProps = {
  scope: CourseScope;
  isLoading: boolean;
  content: readonly ScopedRenderedSection[];
  preselectItem?: number;
};

function CourseContentContainer({ scope, isLoading, content, preselectItem }: CourseContentContainerProps) {
  const { push } = useNavigation();
  const cache = useSyllabusAnalysisCache();
  const selectedArtifact = useMemo(() => selectSyllabusArtifact(content), [content]);
  const cacheState = getSyllabusCacheState(cache.get(scope.id), selectedArtifact?.identity);

  const preselectedModule = useMemo(() => {
    if (preselectItem == null) return;
    for (const section of content) {
      const scoped = section.modules.find(({ module }) => String(module.id) === String(preselectItem));
      if (scoped) return scoped;
    }
  }, [preselectItem, content]);

  const hasVisitedPreselectedItem = useRef<string | null>(null);
  const shouldNavigate = preselectedModule && preselectedModule.module.modname in ModuleViewComponents;
  const preselectedItemId = preselectedModule ? getModuleListItemId(preselectedModule.module) : null;

  useEffect(() => {
    if (!shouldNavigate || !preselectedModule) return;
    const preselectedKey = String(preselectedModule.module.id);
    if (hasVisitedPreselectedItem.current === preselectedKey) return;
    hasVisitedPreselectedItem.current = preselectedKey;
    const Component = ModuleViewComponents[preselectedModule.module.modname as Modname]!;
    push(
      <CourseContext value={{ scope, activeCourse: preselectedModule.course }}>
        <Component module={preselectedModule.module} />
      </CourseContext>,
    );
  }, [preselectedModule, push, shouldNavigate, scope]);

  if (shouldNavigate) return <List navigationTitle={scope.title} isLoading={isLoading} />;

  return (
    <CourseContentList
      key={`${scope.id}:${preselectedItemId ?? ""}`}
      scope={scope}
      isLoading={isLoading}
      content={content}
      selectedArtifact={selectedArtifact?.identity}
      cacheState={cacheState}
      onRefreshAnalysis={() => {
        cache.remove(scope.id);
        push(<LazyViewCourseGrades scope={scope} forceRefresh />);
      }}
      preselectedItemId={preselectedItemId ?? undefined}
    />
  );
}

type CourseContentListProps = {
  scope: CourseScope;
  isLoading: boolean;
  content: readonly ScopedRenderedSection[];
  selectedArtifact?: SyllabusArtifactIdentity;
  cacheState: ReturnType<typeof getSyllabusCacheState>;
  onRefreshAnalysis: () => void;
  preselectedItemId?: string | null;
};

function CourseContentList({
  scope,
  isLoading,
  content,
  selectedArtifact,
  cacheState,
  onRefreshAnalysis,
  preselectedItemId,
}: CourseContentListProps) {
  const allModules = useMemo(() => content.flatMap((section) => section.modules), [content]);
  const scopedItemIdsByModuleRef = useMemo(() => {
    const map = new WeakMap<Module, string>();
    for (const scopedModule of allModules) {
      map.set(scopedModule.module, scopedModule.id);
    }
    return map;
  }, [allModules]);
  const firstListItemId = getFirstListItemId(content);
  const initialSelectedItemId = preselectedItemId ?? firstListItemId ?? null;
  const [forcedSelectedItemId, setForcedSelectedItemId] = useState<string | null>(initialSelectedItemId);
  const [isShowingDetail, setIsShowingDetail] = useState(() => Boolean(initialSelectedItemId?.startsWith("D-")));
  const selectedItemIdRef = useRef<string | null>(initialSelectedItemId);
  const preselectGuardRef = useRef({
    target: preselectedItemId ?? null,
    retries: 0,
    done: !preselectedItemId,
  });

  useEffect(() => {
    if (!forcedSelectedItemId) return;
    const timeout = setTimeout(() => setForcedSelectedItemId(null), 0);
    return () => clearTimeout(timeout);
  }, [forcedSelectedItemId]);

  useEffect(() => {
    preselectGuardRef.current = {
      target: preselectedItemId ?? null,
      retries: 0,
      done: !preselectedItemId,
    };
  }, [preselectedItemId]);

  return (
    <List
      navigationTitle={scope.title}
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      selectedItemId={forcedSelectedItemId ?? undefined}
      onSelectionChange={(id) => {
        if (!id || selectedItemIdRef.current === id) return;
        const guard = preselectGuardRef.current;
        if (!guard.done && guard.target) {
          if (id === guard.target) {
            guard.done = true;
            setForcedSelectedItemId(null);
          } else if (guard.retries < 4) {
            guard.retries++;
            setForcedSelectedItemId(guard.target);
            return;
          } else {
            guard.done = true;
            setForcedSelectedItemId(null);
          }
        }
        selectedItemIdRef.current = id;
        setIsShowingDetail(id.startsWith("D-"));
      }}
    >
      <WithHiddenItems
        namespace={`course-content-${scope.id}`}
        data={allModules}
        getItemKey={(item) => getHiddenItemKey(item, scopedItemIdsByModuleRef)}
      >
        {(visibleModules, { isPinnedSection }) => {
          if (isPinnedSection) {
            const pinnableModules = visibleModules.filter(({ module }) => module.modname !== "label");
            if (pinnableModules.length === 0) return null;
            return (
              <List.Section title="Pinned">
                <RenderedModuleItems
                  modules={pinnableModules}
                  scope={scope}
                  selectedArtifact={selectedArtifact}
                  cacheState={cacheState}
                  onRefreshAnalysis={onRefreshAnalysis}
                />
              </List.Section>
            );
          }

          return regroupCourseContentByVisibleModules(content, visibleModules).map((section) => (
            <List.Section key={section.id} title={section.name}>
              <RenderedModuleItems
                modules={section.modules}
                scope={scope}
                selectedArtifact={selectedArtifact}
                cacheState={cacheState}
                onRefreshAnalysis={onRefreshAnalysis}
              />
            </List.Section>
          ));
        }}
      </WithHiddenItems>
    </List>
  );
}

function getFirstListItemId(content: readonly ScopedRenderedSection[]) {
  for (const section of content) {
    const first = section.modules[0];
    if (first) return getModuleListItemId(first.module);
  }
}

function getHiddenItemKey(item: ScopedModule | Module, scopedItemIdsByModuleRef: WeakMap<Module, string>) {
  if ("module" in item) {
    return item.id;
  }
  return scopedItemIdsByModuleRef.get(item) ?? item.id;
}

function RenderedModuleItems({
  modules,
  scope,
  selectedArtifact,
  cacheState,
  onRefreshAnalysis,
}: {
  modules: readonly ScopedModule[];
  scope: CourseScope;
  selectedArtifact?: SyllabusArtifactIdentity;
  cacheState: ReturnType<typeof getSyllabusCacheState>;
  onRefreshAnalysis: () => void;
}) {
  return modules.map(({ id, module, course }) => {
    const Component = ListItems[module.modname as Modname] ?? ListItems.default;
    return (
      <SyllabusAnalysisContext
        key={id}
        value={{
          selectedArtifact,
          cacheState,
          onRefresh: onRefreshAnalysis,
        }}
      >
        <CourseContext value={{ scope, activeCourse: course }}>
          <Component module={module} />
        </CourseContext>
      </SyllabusAnalysisContext>
    );
  });
}
