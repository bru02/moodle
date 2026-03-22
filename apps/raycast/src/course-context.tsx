import type { CourseScope, SimpleCourse } from "@moodle/core";
import { createContext } from "react";

export type CourseContextValue = {
  scope: CourseScope;
  activeCourse: SimpleCourse;
};

const CourseContext = createContext({} as CourseContextValue);
export default CourseContext;
