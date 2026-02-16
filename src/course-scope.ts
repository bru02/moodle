import { SimpleCourse } from "./types/simple-course";

export type CourseScope = {
  id: string;
  courseIds: number[];
  courses: SimpleCourse[];
  title: string;
  mergedCourse: SimpleCourse;
};

export function buildCourseScopes(courses: readonly SimpleCourse[], merge = true): CourseScope[] {
  if (!merge) return courses.map((course) => makeScope([course]));

  const res: CourseScope[] = [];
  const taken = new Set<number>();

  for (let i = 0; i < courses.length; i++) {
    if (taken.has(i)) continue;

    const group: SimpleCourse[] = [courses[i]];
    taken.add(i);

    for (let j = i + 1; j < courses.length; j++) {
      if (taken.has(j)) continue;
      if (!isMergeCandidate(courses[i], courses[j])) continue;
      group.push(courses[j]);
      taken.add(j);
    }

    res.push(makeScope(group));
  }

  return res;
}

export function findScopeByCourseId(scopes: readonly CourseScope[], courseId: number) {
  return scopes.find((scope) => scope.courseIds.includes(courseId));
}

function makeScope(group: readonly SimpleCourse[]): CourseScope {
  const courses = [...group].sort((a, b) => a.id - b.id);
  const sortedIds = [...new Set(group.map((course) => course.id))].sort((a, b) => a - b);
  const title = commonTitle(group);
  const imageSource = group.find((course) => !isGeneratedCourseImage(course.courseimage)) ?? group[0];
  const mostRecent = [...group].sort((a, b) => b.timemodified - a.timemodified)[0];
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
      semester,
      seminarGroup,
    },
  };
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
  const title = baseTitle(group[0].displayname);
  return title || group[0].displayname;
}

function isMergeCandidate(a: SimpleCourse, b: SimpleCourse) {
  return normalize(baseTitle(a.displayname)) === normalize(baseTitle(b.displayname));
}

function baseTitle(title: string) {
  const parts = title.trim().split(/\s+/);
  if (parts.length <= 2) return title.trim();
  return parts.slice(0, -2).join(" ").trim();
}

function normalize(title: string) {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}
