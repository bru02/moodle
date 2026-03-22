import type {
  CoreCourseGetContentsWSResponse,
  CoreCourseGetContentsWSSection,
  CoreCourseGetContentsWSModule,
  RawRenderedSection,
  ScopedModule,
  ScopedRenderedSection,
} from "./course-content-types";
import type { CourseScope, SimpleCourse } from "./course-types";
import { stripHTML } from "./utils";

const EMPTY_CONTENT: CoreCourseGetContentsWSSection[] = [];

export function buildCoursesById(scope: CourseScope) {
  const map = new Map<number, SimpleCourse>();

  for (const course of scope.courses) {
    map.set(course.id, course);
  }

  for (const courseId of scope.courseIds) {
    if (!map.has(courseId)) {
      map.set(courseId, { ...scope.mergedCourse, id: courseId });
    }
  }

  return map;
}

export function buildScopedSections(
  scope: CourseScope,
  contentRows: readonly (CoreCourseGetContentsWSResponse | undefined)[] | undefined,
) {
  const coursesById = buildCoursesById(scope);
  const sections = (contentRows ?? []).flatMap((content, index) => {
    const courseId = scope.courseIds[index];
    if (courseId == null) return [];
    const course = coursesById.get(courseId) ?? { ...scope.mergedCourse, id: courseId };

    return regroupCourseContent(content || EMPTY_CONTENT).map((section) => ({
      ...section,
      id: `${courseId}:${section.id}`,
      modules: section.modules.map((module) => ({
        id: `${courseId}:${module.id}`,
        module,
        course,
        sectionName: section.name,
      })),
    }));
  });

  const byName = new Map<string, ScopedRenderedSection>();

  for (const section of sections) {
    const key = section.name.trim().toLowerCase();
    const previous = byName.get(key);
    if (!previous) {
      byName.set(key, { ...section, id: key });
      continue;
    }

    byName.set(key, {
      ...previous,
      section: Math.max(previous.section ?? -1, section.section ?? -1),
      modules: [...previous.modules, ...section.modules],
    });
  }

  return [...byName.values()].sort((left, right) => (right.section ?? -1) - (left.section ?? -1));
}

export function regroupCourseContent(content: readonly CoreCourseGetContentsWSSection[]) {
  const result: RawRenderedSection[] = [];

  for (const section of content.toReversed()) {
    const carry = { ...section, modules: [] as CoreCourseGetContentsWSModule[], subtitle: "" };
    let { modules } = section;

    if (section.summary) {
      const text = stripHTML(section.summary);
      const dummyModule: CoreCourseGetContentsWSModule = {
        id: -section.id,
        name: text,
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

      if (text.length > 0) {
        modules = [dummyModule, ...modules];
      }
    }

    for (const module of modules) {
      if (module.modname === "label") {
        const text = stripHTML(module.description || "");
        if (text.length < 50) {
          result.push({ ...carry });
          carry.modules = [];
          carry.id = module.id;
          carry.name = text.length > 50 ? `${text.slice(0, 50).trimEnd()}...` : text;
          carry.subtitle = section.name;
          continue;
        }
      }

      carry.modules.push(module);
    }

    if (carry.modules.length > 0) {
      result.push(carry);
    }
  }

  return result;
}

export function regroupCourseContentByVisibleModules(
  regroupedContent: readonly ScopedRenderedSection[],
  visibleModules: readonly ScopedModule[],
) {
  const visibleIds = new Set(visibleModules.map((module) => module.id));
  const nextContent: ScopedRenderedSection[] = [];

  for (const section of regroupedContent) {
    const modules = section.modules.filter((module) => visibleIds.has(module.id));
    if (modules.length === 0) continue;
    nextContent.push({ ...section, modules });
  }

  return nextContent;
}
