import { List, useNavigation } from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthErrorDetail from "./components/AuthErrorDetail";
import WithHiddenItems from "./components/WithHiddenItems";
import CourseContext from "./course-context";
import { stripHTML } from "./helpers";
import { getFilePath } from "./helpers/files";
import { getModuleListItemId } from "./helpers/modules";
import { useWSQuery } from "./hooks/useWSQuery";
import ListItems, { ModuleViewComponents } from "./mods";
import { useSync } from "./sync";
import { Course, Module } from "./types";
import { CoreCourseGetContentsWSSection, Modname } from "./types/contents";

type RenderedContent = CoreCourseGetContentsWSSection & { subtitle: string };
const EMPTY_CONTENT: CoreCourseGetContentsWSSection[] = [];

export default function ViewCourse({ course, preselectItem }: { course: Course; preselectItem?: number }) {
  console.log("Rendering ViewCourse for course:", course.id);
  const courseId = String(course.id);
  const { displayname: displayName } = course;
  const { data, isFetching, error, refetch } = useWSQuery(
    "core_course_get_contents",
    {
      courseid: courseId,
    },
    { staleTime: 0 },
  );

  const content = data ?? EMPTY_CONTENT;

  const files = useMemo(() => {
    return content
      .toReversed()
      .flatMap((section) =>
        section.modules.flatMap(
          (mod) =>
            mod.contents
              ?.filter(
                (f) => f.type === "file" && !(f.filename === "index.html" && ["page", "book"].includes(mod.modname)),
              )
              .map((f) => [getFilePath(f, mod, course), f] as const) ?? [],
        ),
      );
  }, [content, course]);

  useSync(files);

  if (error) {
    return <AuthErrorDetail error={error} onRetry={() => refetch()} />;
  }

  if (!data && isFetching) {
    return (
      <CourseContext value={course}>
        <List navigationTitle={displayName} isLoading />
      </CourseContext>
    );
  }

  return (
    <CourseContext value={course}>
      <CourseContentContainer
        key={courseId}
        displayName={displayName}
        isLoading={isFetching}
        content={content}
        preselectItem={preselectItem}
        courseId={courseId}
      />
    </CourseContext>
  );
}

type CourseContentContainerProps = {
  courseId: string;
  displayName: string;
  isLoading: boolean;
  content: readonly CoreCourseGetContentsWSSection[];
  preselectItem?: number;
};

function CourseContentContainer({
  displayName,
  isLoading,
  content,
  preselectItem,
  courseId,
}: CourseContentContainerProps) {
  const { push } = useNavigation();

  const preselectedModule = useMemo(() => {
    if (preselectItem == null) {
      return;
    }

    for (const section of content) {
      const module = section.modules.find((mod) => mod.id == preselectItem);
      if (module) {
        return module;
      }
    }
  }, [preselectItem, content]);

  const hasVisitedPreselectedItem = useRef<string | null>(null);
  const shouldNavigate = preselectedModule && preselectedModule.modname in ModuleViewComponents;
  const preselectedItemId = preselectedModule ? getModuleListItemId(preselectedModule) : null;

  useEffect(() => {
    if (!shouldNavigate || !preselectedModule) {
      return;
    }

    const preselectedKey = String(preselectedModule.id);
    if (hasVisitedPreselectedItem.current === preselectedKey) {
      return;
    }

    hasVisitedPreselectedItem.current = preselectedKey;
    const Component = ModuleViewComponents[preselectedModule.modname as Modname]!;
    push(<Component module={preselectedModule} />);
  }, [preselectedModule, push, shouldNavigate]);

  if (shouldNavigate) {
    return <List navigationTitle={displayName} isLoading={isLoading} />;
  }

  return (
    <CourseContentList
      key={courseId}
      displayName={displayName}
      isLoading={isLoading}
      content={content}
      courseId={courseId}
      preselectedItemId={preselectedItemId ?? undefined}
    />
  );
}

type CourseContentListProps = {
  courseId: string;
  displayName: string;
  isLoading: boolean;
  content: readonly CoreCourseGetContentsWSSection[];
  preselectedItemId?: string | null;
};

function CourseContentList({ courseId, displayName, isLoading, content, preselectedItemId }: CourseContentListProps) {
  const regroupedContent = useMemo(() => regroupCourseContent(content), [content]);
  const allModules = useMemo(() => regroupedContent.flatMap((section) => section.modules), [regroupedContent]);
  const firstListItemId = getFirstListItemId(regroupedContent);
  const initialSelectedItemId = preselectedItemId ?? firstListItemId ?? null;
  const [forcedSelectedItemId, setForcedSelectedItemId] = useState<string | null>(initialSelectedItemId);
  const [isShowingDetail, setIsShowingDetail] = useState(() => Boolean(initialSelectedItemId?.startsWith("D-")));
  const selectedItemIdRef = useRef<string | null>(initialSelectedItemId);

  useEffect(() => {
    if (!forcedSelectedItemId) return;
    const timeout = setTimeout(() => setForcedSelectedItemId(null), 0);
    return () => clearTimeout(timeout);
  }, [forcedSelectedItemId]);

  console.log("Rendering List with content sections:");

  return (
    <List
      navigationTitle={displayName}
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      selectedItemId={forcedSelectedItemId ?? undefined}
      onSelectionChange={(id) => {
        if (!id) return;
        if (selectedItemIdRef.current === id) return;
        selectedItemIdRef.current = id;
        setIsShowingDetail(id.startsWith("D-"));
      }}
    >
      <WithHiddenItems namespace={`course-content-${courseId}`} data={allModules}>
        {(visibleModules, { isPinnedSection }) => {
          if (isPinnedSection) {
            const pinnableModules = visibleModules.filter((module) => module.modname !== "label");

            if (pinnableModules.length === 0) {
              return null;
            }

            return (
              <List.Section title="Pinned">
                <RenderedModuleItems modules={pinnableModules} />
              </List.Section>
            );
          }

          return regroupCourseContentByVisibleModules(regroupedContent, visibleModules).map((section) => (
            <List.Section key={section.id} title={section.name} subtitle={section.subtitle}>
              <RenderedModuleItems modules={section.modules} />
            </List.Section>
          ));
        }}
      </WithHiddenItems>
    </List>
  );
}

function getFirstListItemId(content: readonly RenderedContent[]) {
  for (const section of content) {
    const firstModule = section.modules[0];
    if (firstModule) {
      return getModuleListItemId(firstModule);
    }
  }
}

function regroupCourseContent(content: readonly CoreCourseGetContentsWSSection[]) {
  const res = [] as RenderedContent[];
  for (const section of content.toReversed()) {
    const carry = {
      ...section,
      modules: [] as Module[],
      subtitle: "",
    };

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

    if (carry.modules.length > 0) {
      res.push(carry);
    }
  }

  return res;
}

function regroupCourseContentByVisibleModules(
  regroupedContent: readonly RenderedContent[],
  visibleModules: readonly Module[],
): RenderedContent[] {
  const visibleIds = new Set(visibleModules.map((module) => module.id));
  const nextContent = [] as RenderedContent[];

  for (const section of regroupedContent) {
    const modules = section.modules.filter((module) => visibleIds.has(module.id));
    if (modules.length === 0) {
      continue;
    }
    nextContent.push({ ...section, modules });
  }

  return nextContent;
}

function RenderedModuleItems({ modules }: { modules: readonly Module[] }) {
  return modules.map((module: Module) => {
    const Component = ListItems[module.modname as Modname] ?? ListItems.default;
    return <Component key={module.id} module={module} />;
  });
}
