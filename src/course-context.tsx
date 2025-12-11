import { createContext } from "react";
import { Course } from "./types";

const CourseContext = createContext({} as Course);
export default CourseContext;
