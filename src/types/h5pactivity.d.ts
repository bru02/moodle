import { CoreCourseModuleStandardElements, CoreWSExternalFile, CoreWSExternalWarning } from ".";

export const AddonModH5PActivityGradeMethod = {
  GRADEMANUAL: 0,
  GRADEHIGHESTATTEMPT: 1,
  GRADEAVERAGEATTEMPT: 2,
  GRADELASTATTEMPT: 3,
  GRADEFIRSTATTEMPT: 4,
} as const;

export type AddonModH5PActivityGradeMethod =
  (typeof AddonModH5PActivityGradeMethod)[keyof typeof AddonModH5PActivityGradeMethod];

export type AddonModH5pactivityGlobalSettings = {
  enablesavestate: boolean;
  savestatefreq?: number;
};

export type AddonModH5PActivityWSData = CoreCourseModuleStandardElements & {
  timecreated?: number;
  timemodified?: number;
  grade?: number;
  displayoptions: number;
  enabletracking: number;
  grademethod: AddonModH5PActivityGradeMethod;
  contenthash?: string;
  context: number;
  package: CoreWSExternalFile[];
  deployedfile?: {
    filename?: string;
    filepath?: string;
    filesize?: number;
    fileurl: string;
    timemodified?: number;
    mimetype?: string;
  };
};

export type AddonModH5pactivityGetByCoursesWSParams = {
  courseids?: number[];
};

export type AddonModH5pactivityGetByCoursesWSResponse = {
  h5pactivities: AddonModH5PActivityWSData[];
  h5pglobalsettings?: AddonModH5pactivityGlobalSettings;
  warnings?: CoreWSExternalWarning[];
};

export type AddonModH5pactivityGetH5pactivityAccessInformationWSParams = {
  h5pactivityid: number;
};

export type AddonModH5pactivityGetH5pactivityAccessInformationWSResponse = {
  warnings?: CoreWSExternalWarning[];
  canview?: boolean;
  canaddinstance?: boolean;
  cansubmit?: boolean;
  canreviewattempts?: boolean;
};

export type AddonModH5pactivityGetAttemptsWSParams = {
  h5pactivityid: number;
  userids?: number[];
};

export type AddonModH5pactivityGetAttemptsWSResponse = {
  activityid: number;
  usersattempts: AddonModH5PActivityWSUserAttempts[];
  warnings?: CoreWSExternalWarning[];
};

export type AddonModH5PActivityWSUserAttempts = {
  userid: number;
  attempts: AddonModH5PActivityWSAttempt[];
  scored?: {
    title: string;
    grademethod: string;
    attempts: AddonModH5PActivityWSAttempt[];
  };
};

export type AddonModH5PActivityWSAttempt = {
  id: number;
  h5pactivityid: number;
  userid: number;
  timecreated: number;
  timemodified: number;
  attempt: number;
  rawscore: number;
  maxscore: number;
  duration: number;
  completion?: number;
  success?: number | null;
  scaled: number;
};
