import { createContext } from "react";
import { CourseScope } from "./course-scope";
import { SimpleCourse } from "./types/simple-course";

export type CourseContextValue = {
  scope: CourseScope;
  activeCourse: SimpleCourse;
};

const CourseContext = createContext({} as CourseContextValue);
export default CourseContext;
