import type {
  CoreCourseGetContentsWSModule,
  CoreCourseGetContentsWSResponse,
} from "@moodle/core";
import type { SimpleCourse } from "@moodle/core";
import type { CoreGradesGetUserGradesTableWSResponse } from "@moodle/core";

export type CourseGradesCredentials = {
  siteOrigin: string;
  username?: string;
  password?: string;
  token?: string;
  privateToken?: string;
};

export type CourseGradesSyncOptions = {
  credentials: CourseGradesCredentials;
  outputDir: string;
  neptuneCode?: string;
  courseIds?: readonly number[];
  semester?: string | "all" | null;
  mergeCourses?: boolean;
};

export type SyncedMoodleFile = {
  courseId: number;
  moduleId: number;
  moduleName: string;
  sectionName: string;
  filename: string;
  sourceUrl: string;
  path: string;
  contentType?: string;
  bytes: number;
};

export type SyncedCourse = {
  course: SimpleCourse;
  contents: CoreCourseGetContentsWSResponse;
  grades?: CoreGradesGetUserGradesTableWSResponse;
  files: SyncedMoodleFile[];
};

export type CourseGradesSyncResult = {
  syncedAt: string;
  siteOrigin: string;
  userId: number;
  username?: string;
  courses: SyncedCourse[];
};

export type EvidenceKind = "syllabus" | "neptune-code" | "grade" | "content";

export type CourseEvidenceItem = {
  kind: EvidenceKind;
  courseId: number;
  courseName: string;
  moduleId?: number;
  moduleName?: string;
  sectionName?: string;
  source: string;
  text: string;
  score: number;
};

export type CourseAnalysisBundle = {
  generatedAt: string;
  neptuneCode?: string;
  evidence: CourseEvidenceItem[];
  llmInput: string;
};

export type MoodleModuleWithCourse = {
  course: SimpleCourse;
  sectionName: string;
  module: CoreCourseGetContentsWSModule;
};
