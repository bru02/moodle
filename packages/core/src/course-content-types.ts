import type { SimpleCourse } from "./course-types";
import type { CoreTextFormat, CoreWSExternalFile } from "./moodle-types";

export type CoreCourseModuleContentFile = CoreWSExternalFile & {
  filename: string;
  filepath: string;
  filesize: number;
  timemodified: number;
  type: string;
  content?: string;
  timecreated: number;
  sortorder: number;
  userid: number;
  author: string;
  license: string;
  tags?: CoreTagItem[];
};

export type CoreCourseGetContentsWSModule = {
  id: number;
  url?: string;
  section?: number;
  name: string;
  instance: number;
  contextid?: number;
  description?: string;
  visible: number;
  uservisible: boolean;
  availabilityinfo?: string;
  visibleoncoursepage: number;
  modicon: string;
  modname: string;
  branded?: boolean;
  modplural: string;
  availability?: string;
  indent: number;
  onclick?: string;
  afterlink?: string;
  activitybadge?: {
    badgecontent?: string;
    badgestyle?: string;
    badgeurl?: string;
    badgeelementid?: string;
    badgeextraattributes?: {
      name?: string;
      value?: string;
    }[];
  };
  customdata?: string;
  noviewlink?: boolean;
  completion?: CoreCourseModuleCompletionTracking;
  purpose?: string;
  contents?: CoreCourseModuleContentFile[];
  groupmode?: number;
  downloadcontent?: number;
  dates?: {
    label: string;
    timestamp: number;
    relativeto?: number;
    dataid?: string;
  }[];
  contentsinfo?: {
    filescount: number;
    filessize: number;
    lastmodified: number;
    mimetypes: string[];
    repositorytype?: string;
  };
  completiondata?: CoreCourseModuleWSCompletionData;
};

export type CoreCourseGetContentsWSSection = {
  id: number;
  name: string;
  visible?: number;
  summary: string;
  summaryformat?: CoreTextFormat | number;
  section?: number;
  hiddenbynumsections?: number;
  uservisible?: boolean;
  availabilityinfo?: string;
  modules: CoreCourseGetContentsWSModule[];
  component?: string;
  itemid?: number;
};

export type CoreCourseGetContentsWSResponse = CoreCourseGetContentsWSSection[];

export type RawRenderedSection = CoreCourseGetContentsWSSection & {
  subtitle: string;
};
export type ScopedModule = {
  id: string;
  module: CoreCourseGetContentsWSModule;
  course: SimpleCourse;
  sectionName: string;
};
export type ScopedRenderedSection = Omit<
  RawRenderedSection,
  "id" | "modules"
> & {
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

export const CoreCourseModuleCompletionTracking = {
  NONE: 0,
  MANUAL: 1,
  AUTOMATIC: 2,
} as const;

export type CoreCourseModuleCompletionTracking =
  (typeof CoreCourseModuleCompletionTracking)[keyof typeof CoreCourseModuleCompletionTracking];

export type CoreCourseModuleWSCompletionData = {
  state: CoreCourseModuleCompletionStatus;
  timecompleted: number;
  overrideby: number | null;
  valueused?: boolean;
  hascompletion?: boolean;
  isautomatic?: boolean;
  istrackeduser?: boolean;
  uservisible?: boolean;
  details?: CoreCourseModuleWSRuleDetails[];
  isoverallcomplete?: boolean;
};

export type CoreCourseModuleWSRuleDetails = {
  rulename: string;
  rulevalue: {
    status: number;
    description: string;
  };
};

export type CoreTagItem = {
  id: number;
  name: string;
  rawname: string;
  isstandard: boolean;
  tagcollid: number;
  taginstanceid: number;
  taginstancecontextid: number;
  itemid: number;
  ordering: number;
  flag: number;
  viewurl?: string;
};
