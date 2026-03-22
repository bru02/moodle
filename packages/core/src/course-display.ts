import {
  CoreCourseModuleCompletionStatus,
  type ScopedModule,
  type ScopedRenderedSection,
} from "./course-content-types";
import type { CourseScope } from "./course-types";

const SECONDS_WEEK = 7 * 24 * 60 * 60;
const DST_OFFSET_SECONDS = 2 * 60 * 60;

export type CourseDisplaySectionCategory = "current-week" | "past-week" | "future-week" | "other";

export type CourseDisplaySection = {
  id: string;
  title: string;
  modules: readonly ScopedModule[];
  category: CourseDisplaySectionCategory;
};

export type CourseDisplayLayout = {
  surfacedModules: readonly ScopedModule[];
  sections: readonly CourseDisplaySection[];
  currentWeekNumber: number | null;
  lastVisitedWeekNumber: number | null;
};

export function buildCourseDisplayLayout(
  scope: CourseScope,
  sections: readonly ScopedRenderedSection[],
  options: {
    now?: number;
    dismissedRecentItemIds?: ReadonlySet<string>;
  } = {},
): CourseDisplayLayout {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const dismissedRecentItemIds = options.dismissedRecentItemIds ?? new Set<string>();
  const currentWeekNumber = getCourseWeekNumberAtTimestamp(scope, now);
  const lastVisitedWeekNumber = getCourseWeekNumberAtTimestamp(scope, scope.mergedCourse.lastaccess);
  const anchorWeekNumber = currentWeekNumber ?? lastVisitedWeekNumber;
  const lastVisitedWeekStart =
    typeof lastVisitedWeekNumber === "number" ? getWeekStartTimestamp(scope, lastVisitedWeekNumber) : null;
  const surfacedModuleIds = new Set<string>();

  const surfacedModules = sections
    .flatMap((section) =>
      section.modules.filter((module) => {
        if (dismissedRecentItemIds.has(module.id)) return false;
        if (shouldSurfaceRecentNonWeekModule(scope, section, module, lastVisitedWeekStart)) {
          surfacedModuleIds.add(module.id);
          return true;
        }
        if (shouldSurfaceClosingSoonModule(module, now)) {
          surfacedModuleIds.add(module.id);
          return true;
        }
        return false;
      }),
    )
    .toSorted(compareSurfacedModules);

  const nextSections = sections
    .map((section, index) => ({
      section,
      index,
      modules: section.modules.filter((module) => !surfacedModuleIds.has(module.id)),
    }))
    .filter((entry) => entry.modules.length > 0)
    .map((entry) => ({
      id: entry.section.id,
      title: entry.section.name,
      modules: entry.modules,
      category: classifySection(scope, entry.section, anchorWeekNumber, now),
      index: entry.index,
      sectionNumber: entry.section.section ?? -1,
    }))
    .toSorted((left, right) => compareSections(left, right));

  return {
    surfacedModules,
    sections: nextSections,
    currentWeekNumber,
    lastVisitedWeekNumber,
  };
}

export function getCourseWeekNumberAtTimestamp(scope: CourseScope, timestamp?: number | null) {
  const { startdate, enddate } = scope.mergedCourse;
  if (
    scope.mergedCourse.format !== "weeks" ||
    !startdate ||
    !timestamp ||
    timestamp < startdate ||
    (enddate != null && timestamp > enddate)
  ) {
    return null;
  }

  return Math.floor((timestamp - (startdate + DST_OFFSET_SECONDS)) / SECONDS_WEEK) + 1;
}

function getWeekStartTimestamp(scope: CourseScope, sectionNumber: number) {
  const startdate = scope.mergedCourse.startdate;
  if (!startdate || sectionNumber < 1) return null;
  return startdate + DST_OFFSET_SECONDS + SECONDS_WEEK * (sectionNumber - 1);
}

function isWeekSection(scope: CourseScope, section: Pick<ScopedRenderedSection, "section">) {
  return scope.mergedCourse.format === "weeks" && typeof section.section === "number" && section.section >= 1;
}

function getModuleUpdatedAt(module: ScopedModule) {
  const contentTimestamps = module.module.contents?.flatMap((content) =>
    [content.timemodified, content.timecreated].filter(
      (value): value is number => typeof value === "number" && value > 0,
    ),
  );
  const timestamps = [module.module.contentsinfo?.lastmodified, ...(contentTimestamps ?? [])].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );

  if (timestamps.length === 0) return null;
  return Math.max(...timestamps);
}

function shouldSurfaceRecentNonWeekModule(
  scope: CourseScope,
  section: ScopedRenderedSection,
  module: ScopedModule,
  lastVisitedWeekStart: number | null,
) {
  if (lastVisitedWeekStart == null || isWeekSection(scope, section)) return false;
  const updatedAt = getModuleUpdatedAt(module);
  return updatedAt != null && updatedAt >= lastVisitedWeekStart;
}

function shouldSurfaceClosingSoonModule(module: ScopedModule, now: number) {
  const closeAt = module.module.dates?.find((date) => date.dataid === "timeclose")?.timestamp;
  if (!closeAt || closeAt <= now || closeAt > now + 24 * 60 * 60) return false;
  const state = module.module.completiondata?.state;
  return state == null || state === CoreCourseModuleCompletionStatus.COMPLETION_INCOMPLETE;
}

function compareSurfacedModules(left: ScopedModule, right: ScopedModule) {
  const leftCloseAt =
    left.module.dates?.find((date) => date.dataid === "timeclose")?.timestamp ?? Number.POSITIVE_INFINITY;
  const rightCloseAt =
    right.module.dates?.find((date) => date.dataid === "timeclose")?.timestamp ?? Number.POSITIVE_INFINITY;
  if (leftCloseAt !== rightCloseAt) {
    return leftCloseAt - rightCloseAt;
  }
  return (getModuleUpdatedAt(right) ?? 0) - (getModuleUpdatedAt(left) ?? 0);
}

function classifySection(
  scope: CourseScope,
  section: ScopedRenderedSection,
  anchorWeekNumber: number | null,
  now: number,
): CourseDisplaySectionCategory {
  if (!isWeekSection(scope, section)) {
    return "other";
  }

  if (anchorWeekNumber != null) {
    if (section.section === anchorWeekNumber) return "current-week";
    if ((section.section ?? 0) < anchorWeekNumber) return "past-week";
    return "future-week";
  }

  if (scope.mergedCourse.startdate && now < scope.mergedCourse.startdate) {
    return "future-week";
  }

  if (scope.mergedCourse.enddate && now > scope.mergedCourse.enddate) {
    return "past-week";
  }

  return "other";
}

function compareSections(
  left: CourseDisplaySection & { index: number; sectionNumber: number },
  right: CourseDisplaySection & { index: number; sectionNumber: number },
) {
  const categoryDelta = categoryRank(left.category) - categoryRank(right.category);
  if (categoryDelta !== 0) return categoryDelta;

  if (left.category === "past-week") {
    const sectionDelta = right.sectionNumber - left.sectionNumber;
    if (sectionDelta !== 0) return sectionDelta;
  }

  if (left.category === "future-week") {
    const sectionDelta = left.sectionNumber - right.sectionNumber;
    if (sectionDelta !== 0) return sectionDelta;
  }

  return left.index - right.index;
}

function categoryRank(category: CourseDisplaySectionCategory) {
  switch (category) {
    case "current-week":
      return 0;
    case "past-week":
      return 1;
    case "future-week":
      return 2;
    case "other":
      return 3;
  }
}
