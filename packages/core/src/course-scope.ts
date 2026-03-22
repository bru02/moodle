import type { CourseScope, SimpleCourse } from "./course-types";

export function buildCourseScopes(courses: readonly SimpleCourse[], merge = true): CourseScope[] {
  if (!merge) return courses.map((course) => makeScope([course]));

  const result: CourseScope[] = [];
  const taken = new Set<number>();

  for (let index = 0; index < courses.length; index++) {
    if (taken.has(index)) continue;

    const group: SimpleCourse[] = [courses[index]!];
    taken.add(index);

    for (let cursor = index + 1; cursor < courses.length; cursor++) {
      if (taken.has(cursor)) continue;
      if (!isMergeCandidate(courses[index]!, courses[cursor]!)) continue;
      group.push(courses[cursor]!);
      taken.add(cursor);
    }

    result.push(makeScope(group));
  }

  return result;
}

export function findScopeByCourseId(scopes: readonly CourseScope[], courseId: number) {
  return scopes.find((scope) => scope.courseIds.includes(courseId));
}

function makeScope(group: readonly SimpleCourse[]): CourseScope {
  const courses = [...group].sort((left, right) => left.id - right.id);
  const sortedIds = [...new Set(group.map((course) => course.id))].sort((left, right) => left - right);
  const title = commonTitle(group);
  const imageSource = group.find((course) => !isGeneratedCourseImage(course.courseimage)) ?? group[0];
  const mostRecent = [...group].sort((left, right) => right.timemodified - left.timemodified)[0]!;
  const format = pickFirstDefined(group.map((course) => course.format));
  const startdates = group.map((course) => course.startdate).filter((value): value is number => value != null);
  const enddates = group.map((course) => course.enddate).filter((value): value is number => value != null);
  const lastaccesses = group.map((course) => course.lastaccess).filter((value): value is number => value != null);
  const startdate = startdates.length > 0 ? Math.min(...startdates) : undefined;
  const enddate = enddates.length > 0 ? Math.max(...enddates) : undefined;
  const lastaccess = lastaccesses.length > 0 ? Math.max(...lastaccesses) : undefined;
  const semester = pickSemester(group, mostRecent.semester);
  const seminarGroup = pickSeminarGroup(group, mostRecent.seminarGroup);

  return {
    id: sortedIds.join("-"),
    courseIds: sortedIds,
    courses,
    title,
    mergedCourse: {
      id: imageSource?.id ?? mostRecent.id,
      displayname: title,
      courseimage: imageSource?.courseimage ?? mostRecent.courseimage,
      timemodified: mostRecent.timemodified,
      format,
      startdate,
      enddate,
      lastaccess,
      semester,
      seminarGroup,
    },
  };
}

function pickFirstDefined<T>(values: readonly (T | undefined)[]) {
  return values.find((value): value is T => value !== undefined);
}

function pickSemester(group: readonly SimpleCourse[], fallback?: string) {
  const counts = new Map<string, number>();

  for (const semester of group.map((course) => course.semester).filter(Boolean) as string[]) {
    counts.set(semester, (counts.get(semester) ?? 0) + 1);
  }

  if (counts.size === 0) return fallback;

  const max = Math.max(...counts.values());
  const candidates = [...counts.entries()].filter(([, count]) => count === max).map(([semester]) => semester);

  if (candidates.length === 1) return candidates[0];
  return fallback && candidates.includes(fallback) ? fallback : candidates[0];
}

function pickSeminarGroup(group: readonly SimpleCourse[], fallback?: string) {
  const counts = new Map<string, number>();

  for (const seminarGroup of group.map((course) => course.seminarGroup).filter(Boolean) as string[]) {
    counts.set(seminarGroup, (counts.get(seminarGroup) ?? 0) + 1);
  }

  if (counts.size === 0) return fallback;

  const max = Math.max(...counts.values());
  const candidates = [...counts.entries()].filter(([, count]) => count === max).map(([seminarGroup]) => seminarGroup);

  if (candidates.length === 1) return candidates[0];
  return fallback && candidates.includes(fallback) ? fallback : candidates[0];
}

function isGeneratedCourseImage(url: string) {
  return /generated\/course\.svg(?:$|\?)/.test(url);
}

function commonTitle(group: readonly SimpleCourse[]) {
  const title = baseTitle(group[0]!.displayname);
  return title || group[0]!.displayname;
}

function isMergeCandidate(left: SimpleCourse, right: SimpleCourse) {
  return normalize(baseTitle(left.displayname)) === normalize(baseTitle(right.displayname));
}

function baseTitle(title: string) {
  const parts = title.trim().split(/\s+/);
  if (parts.length <= 2) return title.trim();
  return parts.slice(0, -2).join(" ").trim();
}

function normalize(title: string) {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}
