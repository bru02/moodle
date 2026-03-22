import type { SimpleCourse } from "./course-types";

export type CoreCourseModuleContentFile = {
  filename?: string;
  filepath?: string;
  filesize?: number;
  timemodified?: number;
  timecreated?: number;
  type?: string;
  content?: string;
  mimetype?: string;
};

export type CoreCourseGetContentsWSModule = {
  id: number;
  name: string;
  instance: number;
  description?: string;
  visible: number;
  uservisible: boolean;
  visibleoncoursepage: number;
  modicon: string;
  modname: string;
  modplural: string;
  indent: number;
  purpose?: string;
  contents?: CoreCourseModuleContentFile[];
  dates?: {
    label: string;
    timestamp: number;
    relativeto?: number;
    dataid?: string;
  }[];
  contentsinfo?: {
    filescount?: number;
    filessize?: number;
    lastmodified?: number;
    mimetypes?: string[];
    repositorytype?: string;
  };
  completiondata?: {
    state?: number;
    timecompleted?: number;
    overrideby?: number | null;
  };
};

export type CoreCourseGetContentsWSSection = {
  id: number;
  name: string;
  visible?: number;
  summary: string;
  summaryformat?: number;
  section?: number;
  hiddenbynumsections?: number;
  uservisible?: boolean;
  availabilityinfo?: string;
  modules: CoreCourseGetContentsWSModule[];
};

export type CoreCourseGetContentsWSResponse = CoreCourseGetContentsWSSection[];

export type RawRenderedSection = CoreCourseGetContentsWSSection & { subtitle: string };
export type ScopedModule = {
  id: string;
  module: CoreCourseGetContentsWSModule;
  course: SimpleCourse;
  sectionName: string;
};
export type ScopedRenderedSection = Omit<RawRenderedSection, "id" | "modules"> & {
  id: string;
  modules: ScopedModule[];
};

export const CoreCourseModuleCompletionStatus = {
  COMPLETION_INCOMPLETE: 0,
  COMPLETION_COMPLETE: 1,
  COMPLETION_COMPLETE_PASS: 2,
  COMPLETION_COMPLETE_FAIL: 3,
} as const;

export type CoreCourseModuleCompletionStatus =
  (typeof CoreCourseModuleCompletionStatus)[keyof typeof CoreCourseModuleCompletionStatus];
