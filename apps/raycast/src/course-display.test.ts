import assert from "node:assert/strict";
import test from "node:test";

import { buildCourseDisplayLayout, type CourseScope, type ScopedRenderedSection } from "@moodle/core";

import { Module } from "./types";
import { CoreCourseModuleCompletionStatus } from "./types/contents";

test("buildCourseDisplayLayout surfaces recent non-week modules and groups sections around the current week", () => {
  const scope = {
    id: "217369",
    title: "Sample Course",
    courseIds: [217369],
    courses: [],
    mergedCourse: {
      id: 217369,
      displayname: "Sample Course",
      courseimage: "",
      format: "weeks",
      startdate: Date.UTC(2026, 1, 17, 8) / 1000,
      enddate: Date.UTC(2026, 4, 26, 8) / 1000,
      lastaccess: Date.UTC(2026, 2, 1, 9) / 1000,
      timemodified: 0,
    },
  } satisfies CourseScope;

  const recentGeneralModule = makeScopedModule("course:recent", 1, "Tableau Licence", 1773307497);
  const olderGeneralModule = makeScopedModule("course:older", 2, "Syllabus", 1771014362);
  const week3Module = makeScopedModule("course:week3", 3, "Week 3 Task", 0);
  const week4Module = makeScopedModule("course:week4", 4, "Week 4 Task", 0);
  const week9Module = makeScopedModule("course:week9", 9, "Week 9 Task", 0);
  const closingSoonModule = makeScopedModule("course:closing", 10, "Quiz closing soon", 0, [
    { label: "Closed:", timestamp: Date.UTC(2026, 2, 16, 8) / 1000, dataid: "timeclose" },
  ]);
  const sections = [
    makeSection("general", "General", 0, [recentGeneralModule, olderGeneralModule]),
    makeSection("week-9", "Week 9", 9, [week9Module]),
    makeSection("week-4", "Week 4", 4, [week4Module, closingSoonModule]),
    makeSection("week-3", "Week 3", 3, [week3Module]),
  ] satisfies ScopedRenderedSection[];

  const layout = buildCourseDisplayLayout(scope, sections, {
    now: Date.UTC(2026, 2, 15, 12) / 1000,
  });

  assert.deepEqual(
    layout.surfacedModules.map((module) => module.id),
    ["course:closing", "course:recent"],
  );
  assert.deepEqual(
    layout.sections.map((section) => section.id),
    ["week-4", "week-3", "week-9", "general"],
  );
  assert.deepEqual(
    layout.sections.find((section) => section.id === "week-4")?.modules.map((module) => module.id),
    ["course:week4"],
  );
  assert.deepEqual(
    layout.sections.find((section) => section.id === "general")?.modules.map((module) => module.id),
    ["course:older"],
  );
});

test("dismissed recent modules fall back into everything else", () => {
  const scope = {
    id: "1",
    title: "Sample Course",
    courseIds: [1],
    courses: [],
    mergedCourse: {
      id: 1,
      displayname: "Sample Course",
      courseimage: "",
      format: "weeks",
      startdate: Date.UTC(2026, 1, 17, 8) / 1000,
      lastaccess: Date.UTC(2026, 2, 1, 9) / 1000,
      timemodified: 0,
    },
  } satisfies CourseScope;
  const recentGeneralModule = makeScopedModule("course:recent", 1, "Fresh Upload", 1773307497);
  const sections = [makeSection("general", "General", 0, [recentGeneralModule])] satisfies ScopedRenderedSection[];

  const layout = buildCourseDisplayLayout(scope, sections, {
    now: Date.UTC(2026, 2, 15, 12) / 1000,
    dismissedRecentItemIds: new Set(["course:recent"]),
  });

  assert.deepEqual(layout.surfacedModules, []);
  assert.deepEqual(
    layout.sections.find((section) => section.id === "general")?.modules.map((module) => module.id),
    ["course:recent"],
  );
});

test("closing soon modules stay out of the surfaced bucket when already complete", () => {
  const scope = {
    id: "1",
    title: "Sample Course",
    courseIds: [1],
    courses: [],
    mergedCourse: {
      id: 1,
      displayname: "Sample Course",
      courseimage: "",
      format: "weeks",
      startdate: Date.UTC(2026, 1, 17, 8) / 1000,
      timemodified: 0,
    },
  } satisfies CourseScope;
  const completedClosingModule = makeScopedModule(
    "course:done",
    1,
    "Done quiz",
    0,
    [{ label: "Closed:", timestamp: Date.UTC(2026, 2, 16, 8) / 1000, dataid: "timeclose" }],
    CoreCourseModuleCompletionStatus.COMPLETION_COMPLETE,
  );
  const sections = [makeSection("week-4", "Week 4", 4, [completedClosingModule])] satisfies ScopedRenderedSection[];

  const layout = buildCourseDisplayLayout(scope, sections, {
    now: Date.UTC(2026, 2, 15, 12) / 1000,
  });

  assert.deepEqual(layout.surfacedModules, []);
  assert.deepEqual(
    layout.sections[0]?.modules.map((module) => module.id),
    ["course:done"],
  );
});

test("falls back to last visited week when there is no current week", () => {
  const scope = {
    id: "1",
    title: "Sample Course",
    courseIds: [1],
    courses: [],
    mergedCourse: {
      id: 1,
      displayname: "Sample Course",
      courseimage: "",
      format: "weeks",
      startdate: Date.UTC(2026, 1, 17, 8) / 1000,
      enddate: Date.UTC(2026, 3, 1, 8) / 1000,
      lastaccess: Date.UTC(2026, 2, 10, 12) / 1000,
      timemodified: 0,
    },
  } satisfies CourseScope;
  const sections = [
    makeSection("general", "General", 0, [makeScopedModule("course:general", 1, "General note", 0)]),
    makeSection("week-5", "Week 5", 5, [makeScopedModule("course:week5", 5, "Week 5", 0)]),
    makeSection("week-4", "Week 4", 4, [makeScopedModule("course:week4", 4, "Week 4", 0)]),
    makeSection("week-2", "Week 2", 2, [makeScopedModule("course:week2", 2, "Week 2", 0)]),
  ] satisfies ScopedRenderedSection[];

  const layout = buildCourseDisplayLayout(scope, sections, {
    now: Date.UTC(2026, 4, 1, 12) / 1000,
  });

  assert.deepEqual(
    layout.sections.map((section) => section.id),
    ["week-4", "week-2", "week-5", "general"],
  );
});

function makeSection(id: string, name: string, sectionNumber: number, modules: ScopedRenderedSection["modules"]) {
  return {
    id,
    name,
    subtitle: "",
    summary: "",
    summaryformat: 1,
    section: sectionNumber,
    modules: [...modules],
  } as ScopedRenderedSection;
}

function makeScopedModule(
  id: string,
  moduleId: number,
  name: string,
  lastmodified: number,
  dates?: Module["dates"],
  completionState?: number,
) {
  return {
    id,
    course: {
      id: 1,
      displayname: "Sample Course",
      courseimage: "",
      timemodified: 0,
    },
    sectionName: "General",
    module: {
      id: moduleId,
      name,
      instance: moduleId,
      visible: 1,
      uservisible: true,
      visibleoncoursepage: 1,
      modicon: "",
      modname: "resource",
      modplural: "Files",
      indent: 0,
      dates,
      completiondata:
        completionState == null ? undefined : { state: completionState, timecompleted: 0, overrideby: null },
      contentsinfo: lastmodified
        ? {
            filescount: 1,
            filessize: 1,
            lastmodified,
            mimetypes: [],
          }
        : undefined,
    } as Module,
  };
}
