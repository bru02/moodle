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
  courseCode?: string;
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

export function extractCourseCode(input: Pick<MoodleCourseLike, "fullname" | "displayname" | "shortname">) {
  for (const value of [input.displayname, input.fullname]) {
    const cleanedValue = cleanMoodleText(value);
    for (const match of cleanedValue.matchAll(/\(([^)]+)\)/g)) {
      const candidate = match[1]?.trim();
      if (isLikelyCourseCode(candidate)) return candidate;
    }
  }

  const shortnameMatch = cleanMoodleText(input.shortname)
    .trim()
    .match(/^([A-Z0-9_]{6,})(?=_(?:Előadás|Gyakorlat|Lecture)\b|\s*\(|\s*$)/);
  const shortnameCode = shortnameMatch?.[1]?.trim();
  if (isLikelyCourseCode(shortnameCode)) return shortnameCode;
}

export function stripCourseCodeFromTitle(title: string, courseCode?: string) {
  const cleanedTitle = cleanMoodleText(title).trim();
  if (!courseCode) return cleanedTitle;

  const escapedCourseCode = escapeRegExp(courseCode);
  return cleanedTitle.replace(new RegExp(`\\s*\\(${escapedCourseCode}\\)`, "g"), "").replace(/\s{2,}/g, " ").trim();
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
  const rawDisplayname = cleanMoodleText(course.displayname || course.fullname || course.shortname);
  const courseCode = extractCourseCode(course);
  const displayname = stripCourseCodeFromTitle(rawDisplayname, courseCode);
  const searchableText = cleanMoodleText(`${course.fullname} ${course.shortname} ${displayname}`);

  return {
    id: Number(course.id),
    courseCode,
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

function isLikelyCourseCode(value?: string) {
  if (!value) return false;
  if (SEMESTER_RE.test(value)) return false;
  if (/^[EG]\d{2}(?:[-A-Z0-9]+)?$/i.test(value)) return false;
  return /^[A-Z0-9_]{6,}$/.test(value) && (/\d/.test(value) || value.includes("_"));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type CourseScope = {
  id: string;
  courseIds: number[];
  courses: SimpleCourse[];
  title: string;
  mergedCourse: SimpleCourse;
};
