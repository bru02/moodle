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
  const cleanedText = cleanMoodleText(text);
  for (const token of extractDelimitedTokens(cleanedText)) {
    const candidate = token.trim();
    if (isLikelyCourseCode(normalizeCourseCodeCandidate(candidate))) continue;
    if (isLikelySeminarGroup(candidate)) return candidate;
  }
}

export function extractCourseCode(
  input: Pick<MoodleCourseLike, "fullname" | "displayname" | "shortname">,
) {
  for (const value of [input.displayname, input.fullname]) {
    for (const token of extractDelimitedTokens(value)) {
      const candidate = normalizeCourseCodeCandidate(token.trim());
      if (isLikelyCourseCode(candidate)) return candidate;
    }
  }

  return extractCourseCodeFromShortname(input.shortname);
}

export function stripCourseCodeFromTitle(title: string, courseCode?: string) {
  const cleanedTitle = cleanMoodleText(title).trim();
  if (!courseCode) return cleanedTitle;

  return cleanedTitle
    .replace(
      /\s*(\(([^)]+)\)|\[([^\]]+)\])/g,
      (match, _wrapped, parenToken, bracketToken) => {
        const token = String(parenToken ?? bracketToken ?? "").trim();
        return normalizeCourseCodeCandidate(token) === courseCode ? "" : match;
      },
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function listCourseSemesters(courses: readonly SimpleCourse[]) {
  return [
    ...new Set(
      courses
        .map((course) => course.semester)
        .filter((semester): semester is string => Boolean(semester)),
    ),
  ].sort(compareSemesterLabelsDescending);
}

export function filterCoursesBySemester(
  courses: readonly SimpleCourse[],
  semester?: string | "all" | null,
) {
  if (!semester || semester === "all") return [...courses];
  return courses.filter((course) => course.semester === semester);
}

export function pickPreferredSemester(
  courses: readonly SimpleCourse[],
  currentSemester?: string,
) {
  if (
    currentSemester &&
    courses.some((course) => course.semester === currentSemester)
  ) {
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
  const rawDisplayname = cleanMoodleText(
    course.displayname || course.fullname || course.shortname,
  );
  const courseCode = extractCourseCode(course);
  const displayname = stripCourseCodeFromTitle(rawDisplayname, courseCode);
  const searchableText = cleanMoodleText(
    `${course.fullname} ${course.shortname} ${displayname}`,
  );

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

function extractDelimitedTokens(text: string) {
  const cleanedText = cleanMoodleText(text);
  const tokens: string[] = [];

  for (const match of cleanedText.matchAll(/\(([^)]+)\)|\[([^\]]+)\]/g)) {
    const token = match[1] ?? match[2];
    if (token) tokens.push(token);
  }

  return tokens;
}

function extractCourseCodeFromShortname(shortname: string) {
  const cleanedShortname = cleanMoodleText(shortname).trim();
  const stem = cleanedShortname.replace(/\s*\(\d{4}\/\d{2}\/\d\)\s*$/, "");

  for (const token of stem.split("_")) {
    const candidate = normalizeCourseCodeCandidate(token.trim());
    if (isLikelyCourseCode(candidate)) return candidate;
  }

  const prefixParts = stem.split("_");
  for (let index = 1; index <= prefixParts.length; index++) {
    const candidate = normalizeCourseCodeCandidate(
      prefixParts.slice(0, index).join("_").trim(),
    );
    if (isLikelyCourseCode(candidate)) return candidate;
  }
}

function normalizeCourseCodeCandidate(value?: string) {
  if (!value) return undefined;

  const combinedValueMatch = value.match(/^([A-Z0-9_]{6,})\/\d{4}\/\d{2}\/\d$/);
  return combinedValueMatch?.[1] ?? value;
}

function isLikelyCourseCode(value?: string) {
  if (!value) return false;
  if (SEMESTER_RE.test(value)) return false;
  if (/^[EG]\d{2}(?:[-A-Z0-9]+)?$/i.test(value)) return false;
  if (!/^[A-Z0-9_]{6,}$/.test(value)) return false;

  const segments = value.split("_");
  if (segments.length > 2 || segments.some((segment) => segment.length === 0))
    return false;

  if (segments.length === 1) {
    return /\d/.test(value);
  }

  return segments[1]!.length >= 5;
}

function isLikelySeminarGroup(value?: string) {
  if (!value) return false;
  if (SEMESTER_RE.test(value)) return false;
  if (/^G\d(?:[-A-Z0-9]+)*$/i.test(value)) return true;
  if (/^E\d(?:[-A-Z0-9]+)*$/i.test(value)) return true;
  return /^(?=.*\d)(?=.*_)[A-Z0-9_]+$/.test(value);
}

export type CourseScope = {
  id: string;
  courseIds: number[];
  courses: SimpleCourse[];
  title: string;
  mergedCourse: SimpleCourse;
};
