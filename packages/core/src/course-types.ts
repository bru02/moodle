import { cleanMoodleText } from "./utils";

export type MoodleCourseLike = {
  id: string | number;
  fullname: string;
  displayname: string;
  shortname: string;
  courseimage: string;
  format?: string;
  startdate?: number;
  enddate?: number;
  lastaccess?: number;
  timemodified: number;
};

const SEMESTER_RE = /\d{4}\/\d{2}\/\d/;
const SEMINAR_GROUP_RE = /\((G[^)]*)\)/i;

export type SimpleCourse = {
  id: number;
  semester?: string;
  seminarGroup?: string;
  displayname: string;
  courseimage: string;
  format?: string;
  startdate?: number;
  enddate?: number;
  lastaccess?: number;
  timemodified: number;
};

export function extractSemester(text: string) {
  return text.match(SEMESTER_RE)?.[0];
}

export function extractSeminarGroup(text: string) {
  return text.match(SEMINAR_GROUP_RE)?.[1];
}

export function listCourseSemesters(courses: readonly SimpleCourse[]) {
  return [...new Set(courses.map((course) => course.semester).filter((semester): semester is string => Boolean(semester)))].sort(
    compareSemesterLabelsDescending,
  );
}

export function filterCoursesBySemester(courses: readonly SimpleCourse[], semester?: string | "all" | null) {
  if (!semester || semester === "all") return [...courses];
  return courses.filter((course) => course.semester === semester);
}

export function pickPreferredSemester(courses: readonly SimpleCourse[], currentSemester?: string) {
  if (currentSemester && courses.some((course) => course.semester === currentSemester)) {
    return currentSemester;
  }

  return listCourseSemesters(courses)[0];
}

export function compareSemesterLabelsDescending(left: string, right: string) {
  return compareSemesterLabels(right, left);
}

export function compareSemesterLabels(left: string, right: string) {
  const parsedLeft = parseSemesterLabel(left);
  const parsedRight = parseSemesterLabel(right);

  if (!parsedLeft && !parsedRight) return left.localeCompare(right);
  if (!parsedLeft) return 1;
  if (!parsedRight) return -1;

  if (parsedLeft.year !== parsedRight.year) {
    return parsedLeft.year - parsedRight.year;
  }

  if (parsedLeft.term !== parsedRight.term) {
    return parsedLeft.term - parsedRight.term;
  }

  if (parsedLeft.secondaryYear !== parsedRight.secondaryYear) {
    return parsedLeft.secondaryYear - parsedRight.secondaryYear;
  }

  return left.localeCompare(right);
}

export function toSimpleCourse(course: MoodleCourseLike): SimpleCourse {
  const displayname = cleanMoodleText(course.displayname || course.fullname || course.shortname);
  const searchableText = cleanMoodleText(`${course.fullname} ${course.shortname} ${displayname}`);

  return {
    id: Number(course.id),
    semester: extractSemester(searchableText),
    seminarGroup: extractSeminarGroup(searchableText),
    displayname,
    courseimage: course.courseimage,
    format: course.format,
    startdate: course.startdate,
    enddate: course.enddate,
    lastaccess: course.lastaccess,
    timemodified: course.timemodified,
  };
}

function parseSemesterLabel(value: string) {
  const match = value.match(/(\d{4})\/(\d{2})\/(\d)/);
  if (!match) return undefined;

  return {
    year: Number(match[1]),
    secondaryYear: Number(match[2]),
    term: Number(match[3]),
  };
}

export type CourseScope = {
  id: string;
  courseIds: number[];
  courses: SimpleCourse[];
  title: string;
  mergedCourse: SimpleCourse;
};
