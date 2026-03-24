import type { CoreCourseGetContentsWSModule, CoreCourseGetContentsWSSection } from "./course-content-types";

export enum AuthMethod {
  PASSWORD = "password",
  QR = "qr",
  REFRESH = "refresh",
}

export type MoodleSiteInfo = {
  userid?: number;
  userprivateaccesskey?: string;
  username?: string;
  fullname?: string;
  userpictureurl?: string;
  sitename?: string;
  siteurl?: string;
  message?: string;
  warnings?: CoreWSExternalWarning[];
};

export type MoodleAccount = {
  id: string;
  siteOrigin: string;
  userId: number;
  username?: string;
  fullname?: string;
  avatarUrl?: string;
  authMethod: AuthMethod;
  label?: string;
};

export type StoredAccount = {
  id: string;
  siteOrigin: string;
  userId: number;
  username?: string;
  fullname?: string;
  avatarUrl?: string;
  authMethod: AuthMethod;
  label?: string;
  lastUsedAt?: number;
  isActive?: boolean;
};

export type MoodleSession = {
  account: MoodleAccount;
  siteOrigin: string;
  token: string;
  privateToken?: string;
  accessKey: string;
  authenticatedAt: number;
  authMethod: AuthMethod;
  siteInfo: MoodleSiteInfo;
};

export type MoodleFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type MoodleResponseLike = {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
};

export type MoodleFetchLike = (input: string, init?: MoodleFetchInit) => Promise<MoodleResponseLike>;

export type CoreWSExternalWarning = {
  item?: string;
  itemid?: number;
  warningcode: string;
  message: string;
};

export enum CoreTextFormat {
  FORMAT_MOODLE = 0,
  FORMAT_HTML = 1,
  FORMAT_PLAIN = 2,
  FORMAT_MARKDOWN = 4,
}

export type CoreWSExternalFile = {
  filename?: string;
  filepath?: string;
  filesize?: number;
  fileurl: string;
  timemodified?: number;
  mimetype?: string;
  isexternalfile?: boolean;
  repositorytype?: string;
  icon?: string;
};

export type CoreCourseModuleStandardElements = {
  id: number;
  coursemodule: number;
  course: number;
  name: string;
  intro?: string;
  introformat?: CoreTextFormat | number;
  introfiles?: CoreWSExternalFile[];
  section?: number;
  visible?: boolean;
  groupmode?: number;
  groupingid?: number;
  lang?: string;
};

export type CoreCourseGetContentsParams = {
  courseid: number;
  options?: {
    name: string;
    value: string | number | boolean;
  }[];
};

export type MoodleTokenResponse = {
  token?: string;
  privatetoken?: string;
  message?: string;
  error?: string;
  errorcode?: string;
};

export type MoodleAutologinKeyResponse = {
  key: string;
  autologinurl: string;
  warnings?: CoreWSExternalWarning[];
};

export type MoodleTaskProjection = {
  actionable: readonly TaskItem[];
  recentReview: readonly TaskItem[];
};

export type TaskItem = {
  id: string;
  kind: "assignment" | "quiz" | "attendance" | "module";
  title: string;
  courseId: number;
  courseTitle: string;
  semester?: string;
  url?: string;
  subtitle?: string;
  actionLabel?: string;
  openAt?: number;
  dueAt?: number;
  closeAt?: number;
  reviewAt?: number;
  updatedAt?: number;
  sortTimestamp: number;
  completed?: boolean;
};

export type TaskAssignmentSource = {
  id: number;
  courseId: number;
  name: string;
  openAt?: number;
  dueAt?: number;
  closeAt?: number;
  gradingDueAt?: number;
  submittedAt?: number;
  gradedAt?: number;
  updatedAt?: number;
  url?: string;
};

export type TaskQuizSource = {
  id: number;
  courseId: number;
  name: string;
  openAt?: number;
  closeAt?: number;
  submittedAt?: number;
  gradedAt?: number;
  updatedAt?: number;
  url?: string;
};

export type TaskAttendanceSource = {
  id: number;
  courseId: number;
  name: string;
  sessionAt: number;
  closeAt?: number;
  attendedAt?: number;
  updatedAt?: number;
  url?: string;
};

export type MoodleCourseContentSource = CoreCourseGetContentsWSSection;
export type MoodleCourseContentModule = CoreCourseGetContentsWSModule;
