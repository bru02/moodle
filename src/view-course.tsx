import { List, useNavigation } from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthErrorDetail from "./components/AuthErrorDetail";
import WithHiddenItems from "./components/WithHiddenItems";
import CourseContext from "./course-context";
import { CourseScope } from "./course-scope";
import { stripHTML } from "./helpers";
import { getFilePath } from "./helpers/files";
import { getModuleListItemId } from "./helpers/modules";
import { useWSBatchQuery } from "./hooks/useWSQuery";
import ListItems, { ModuleViewComponents } from "./mods";
import { useSync } from "./sync";
import { Module } from "./types";
import { CoreCourseGetContentsWSSection, Modname } from "./types/contents";
import { SimpleCourse } from "./types/simple-course";

type RawRenderedSection = CoreCourseGetContentsWSSection & { subtitle: string };
type ScopedModule = { id: string; module: Module; course: SimpleCourse };
type ScopedRenderedSection = Omit<RawRenderedSection, "id" | "modules"> & { id: string; modules: ScopedModule[] };

const EMPTY_CONTENT: CoreCourseGetContentsWSSection[] = [];

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

  const coursesById = useMemo(() => {
    const map = new Map<number, SimpleCourse>();
    for (const c of scope.courses) map.set(c.id, c);
    for (const id of scope.courseIds) if (!map.has(id)) map.set(id, { ...scope.mergedCourse, id });
    return map;
  }, [scope]);

  const scopedSections = useMemo(() => {
    const sections = (contentRows ?? []).flatMap((content, index) => {
      const courseId = scope.courseIds[index];
      if (courseId == null) return [];
      const course = coursesById.get(courseId) ?? { ...scope.mergedCourse, id: courseId };
      return regroupCourseContent(content || EMPTY_CONTENT).map((section) => ({
        ...section,
        id: `${courseId}:${section.id}`,
        modules: section.modules.map((module) => ({ id: `${courseId}:${module.id}`, module, course })),
      }));
    });

    const byName = new Map<string, ScopedRenderedSection>();
    for (const section of sections) {
      const key = section.name.trim().toLowerCase();
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, { ...section, id: key });
        continue;
      }

      byName.set(key, {
        ...prev,
        section: Math.max(prev.section ?? -1, section.section ?? -1),
        modules: [...prev.modules, ...section.modules],
      });
    }

    return [...byName.values()].sort((a, b) => (b.section ?? -1) - (a.section ?? -1));
  }, [contentRows, coursesById, scope.courseIds, scope.mergedCourse]);

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
      preselectedItemId={preselectedItemId ?? undefined}
    />
  );
}

type CourseContentListProps = {
  scope: CourseScope;
  isLoading: boolean;
  content: readonly ScopedRenderedSection[];
  preselectedItemId?: string | null;
};

function CourseContentList({ scope, isLoading, content, preselectedItemId }: CourseContentListProps) {
  const allModules = useMemo(() => content.flatMap((section) => section.modules), [content]);
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
      <WithHiddenItems namespace={`course-content-${scope.id}`} data={allModules} getItemKey={(item) => item.id}>
        {(visibleModules, { isPinnedSection }) => {
          if (isPinnedSection) {
            const pinnableModules = visibleModules.filter(({ module }) => module.modname !== "label");
            if (pinnableModules.length === 0) return null;
            return (
              <List.Section title="Pinned">
                <RenderedModuleItems modules={pinnableModules} scope={scope} />
              </List.Section>
            );
          }

          return regroupCourseContentByVisibleModules(content, visibleModules).map((section) => (
            <List.Section key={section.id} title={section.name}>
              <RenderedModuleItems modules={section.modules} scope={scope} />
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

function regroupCourseContent(content: readonly CoreCourseGetContentsWSSection[]) {
  const res = [] as RawRenderedSection[];
  for (const section of content.toReversed()) {
    const carry = { ...section, modules: [] as Module[], subtitle: "" };
    let { modules } = section;

    if (section.summary) {
      const txt = stripHTML(section.summary);
      const dummyModule: Module = {
        id: -section.id,
        name: txt,
        description: section.summary,
        instance: 0,
        visible: 1,
        uservisible: true,
        visibleoncoursepage: 1,
        modicon: "",
        modname: "label",
        modplural: "labels",
        indent: 0,
      };
      if (txt.length > 0) modules = [dummyModule, ...modules];
    }

    for (const module of modules) {
      if (module.modname === "label") {
        const txt = stripHTML(module.description || "");
        if (txt.length < 50) {
          res.push({ ...carry });
          carry.modules = [];
          carry.id = module.id;
          carry.name = txt.length > 50 ? txt.slice(0, 50).trimEnd() + "..." : txt;
          carry.subtitle = section.name;
          continue;
        }
      }
      carry.modules.push(module);
    }

    if (carry.modules.length > 0) res.push(carry);
  }
  return res;
}

function regroupCourseContentByVisibleModules(
  regroupedContent: readonly ScopedRenderedSection[],
  visibleModules: readonly ScopedModule[],
): ScopedRenderedSection[] {
  const visibleIds = new Set(visibleModules.map((module) => module.id));
  const nextContent: ScopedRenderedSection[] = [];

  for (const section of regroupedContent) {
    const modules = section.modules.filter((module) => visibleIds.has(module.id));
    if (modules.length === 0) continue;
    nextContent.push({ ...section, modules });
  }

  return nextContent;
}

function RenderedModuleItems({ modules, scope }: { modules: readonly ScopedModule[]; scope: CourseScope }) {
  return modules.map(({ id, module, course }) => {
    const Component = ListItems[module.modname as Modname] ?? ListItems.default;
    return (
      <CourseContext key={id} value={{ scope, activeCourse: course }}>
        <Component module={module} />
      </CourseContext>
    );
  });
}
