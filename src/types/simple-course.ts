import { Course } from ".";

const SEMESTER_RE = /\d{4}\/\d{2}\/\d/;
const SEMINAR_GROUP_RE = /\((G[^)]*)\)/i;

export type SimpleCourse = {
  id: number;
  semester?: string;
  seminarGroup?: string;
  displayname: string;
  courseimage: string;
  timemodified: number;
};

export function extractSemester(text: string) {
  return text.match(SEMESTER_RE)?.[0];
}

export function extractSeminarGroup(text: string) {
  return text.match(SEMINAR_GROUP_RE)?.[1];
}

export function toSimpleCourse(course: Course): SimpleCourse {
  const displayname = course.displayname || course.fullname || course.shortname;
  const searchableText = `${course.fullname} ${course.shortname} ${displayname}`;
  return {
    id: Number(course.id),
    semester: extractSemester(searchableText),
    seminarGroup: extractSeminarGroup(searchableText),
    displayname,
    courseimage: course.courseimage,
    timemodified: course.timemodified,
  };
}
