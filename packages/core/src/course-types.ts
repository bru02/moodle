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

export function toSimpleCourse(course: MoodleCourseLike): SimpleCourse {
  const displayname = course.displayname || course.fullname || course.shortname;
  const searchableText = `${course.fullname} ${course.shortname} ${displayname}`;

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

export type CourseScope = {
  id: string;
  courseIds: number[];
  courses: SimpleCourse[];
  title: string;
  mergedCourse: SimpleCourse;
};
