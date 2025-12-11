import { List, useNavigation } from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import WithHiddenItems from "./components/WithHiddenItems";
import CourseContext from "./course-context";
import { stripHTML } from "./helpers";
import { getFilePath } from "./helpers/files";
import { getModuleListItemId } from "./helpers/modules";
import { useSuspenseWSQuery } from "./hooks/useWSQuery";
import ListItems, { ModuleViewComponents } from "./mods";
import { useSync } from "./sync";
import { Course, Module } from "./types";
import { CoreCourseGetContentsWSSection, Modname } from "./types/contents";

type RenderedContent = CoreCourseGetContentsWSSection & { subtitle: string };
const EMPTY_CONTENT: CoreCourseGetContentsWSSection[] = [];

export default function ViewCourse({ course, preselectItem }: { course: Course; preselectItem?: number }) {
  const courseId = String(course.id);
  const { displayname: displayName } = course;
  const { data, isPending } = useSuspenseWSQuery("core_course_get_contents", {
    courseid: courseId,
  });
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

  return (
    <CourseContext value={course}>
      <WithHiddenItems namespace={`course-content-${courseId}`} data={content}>
        {(c) => (
          <CourseContentList
            key={courseId}
            displayName={displayName}
            isLoading={isPending}
            content={c}
            preselectItem={preselectItem}
            courseId={courseId}
          />
        )}
      </WithHiddenItems>
    </CourseContext>
  );
}

type CourseContentListProps = {
  courseId: string;
  displayName: string;
  isLoading: boolean;
  content: readonly CoreCourseGetContentsWSSection[];
  preselectItem?: number;
};

function CourseContentList({ displayName, isLoading, content, preselectItem, courseId }: CourseContentListProps) {
  const [isShowingDetail, setIsShowingDetail] = useState<boolean | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
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

  useEffect(() => {
    if (!preselectedModule) {
      return;
    }

    const preselectedKey = String(preselectedModule.id);
    if (hasVisitedPreselectedItem.current === preselectedKey) {
      return;
    }

    hasVisitedPreselectedItem.current = preselectedKey;
    if (!(preselectedModule.modname in ModuleViewComponents)) {
      setTimeout(() => setSelectedItemId(getModuleListItemId(preselectedModule)), 0);
      return;
    }

    const Component = ModuleViewComponents[preselectedModule.modname as Modname]!;
    push(<Component module={preselectedModule} />);
  }, [courseId, preselectedModule, push, isLoading]);

  const regroupedContent = useMemo(() => regroupCourseContent(content), [content]);

  const firstListItemId = getFirstListItemId(regroupedContent);

  const effectiveSelectedItemId = selectedItemId ?? firstListItemId;
  const effectiveIsShowingDetail = isShowingDetail ?? effectiveSelectedItemId?.startsWith("D-") ?? false;

  return (
    <List
      navigationTitle={displayName}
      isLoading={isLoading}
      isShowingDetail={effectiveIsShowingDetail}
      selectedItemId={effectiveSelectedItemId}
      onSelectionChange={(id) => {
        if (!id) return;


        const shouldShow = id.startsWith("D-");
          setIsShowingDetail(shouldShow);
      }}
    >
      {regroupedContent.map((section) => (
        <List.Section key={section.id} title={section.name} subtitle={section.subtitle}>
          {section.modules.map((module: Module) => {
            const Component = ListItems[module.modname as Modname] ?? ListItems.default;
            return <Component key={module.id} module={module} />;
          })}
        </List.Section>
      ))}
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
