import type { CoreTextFormat, CoreWSExternalFile } from ".";

/**
 * Data returned by core_course_get_contents WS.
 */
export type CoreCourseGetContentsWSResponse = CoreCourseGetContentsWSSection[];

/**
 * Section data returned by core_course_get_contents WS.
 */
export type CoreCourseGetContentsWSSection = {
  id: number; // Section ID.
  name: string; // Section name.
  visible?: number; // Is the section visible.
  summary: string; // Section description.
  summaryformat: CoreTextFormat; // Summary format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
  section?: number; // Section number inside the course.
  hiddenbynumsections?: number; // Whether is a section hidden in the course format.
  uservisible?: boolean; // Is the section visible for the user?.
  availabilityinfo?: string; // Availability information.
  modules: CoreCourseGetContentsWSModule[]; // List of module.
  component?: string; // @since 4.5 The delegate component of this section if any.
  itemid?: number; // @since 4.5 The optional item id delegate component can use to identify its instance.
};

/**
 * Params of core_course_get_contents WS.
 */
export type CoreCourseGetContentsParams = {
  courseid: number; // Course id.
  options?: {
    // Options, used since Moodle 2.9.
    /**
     * The expected keys (value format) are:
     *
     * excludemodules (bool) Do not return modules, return only the sections structure
     * excludecontents (bool) Do not return module contents (i.e: files inside a resource)
     * includestealthmodules (bool) Return stealth modules for students in a special
     * section (with id -1)
     * sectionid (int) Return only this section
     * sectionnumber (int) Return only this section with number (order)
     * cmid (int) Return only this module information (among the whole sections structure)
     * modname (string) Return only modules with this name "label, forum, etc..."
     * modid (int) Return only the module with this id (to be used with modname.
     */
    name: string;
    value: string | number | boolean; // The value of the option, this param is personaly validated in the external function.
  }[];
};

/**
 * Module data returned by core_course_get_contents WS.
 */
export type CoreCourseGetContentsWSModule = {
  id: number; // Activity id.
  url?: string; // Activity url.
  name: string; // Activity module name.
  instance: number; // Instance id. Cannot be undefined.
  contextid?: number; // @since 3.10. Activity context id.
  description?: string; // Activity description.
  visible: number; // Is the module visible. Cannot be undefined.
  uservisible: boolean; // Is the module visible for the user?. Cannot be undefined.
  availabilityinfo?: string; // Availability information.
  visibleoncoursepage: number; // Is the module visible on course page. Cannot be undefined.
  modicon: string; // Activity icon url.
  modname: Modname | string; // Activity module type.
  purpose?: string; // @since 4.4 The module purpose.
  branded?: boolean; // @since 4.4 Whether the module is branded or not.
  modplural: string; // Activity module plural name.
  availability?: string; // Module availability settings.
  indent: number; // Number of identation in the site.
  onclick?: string; // Onclick action.
  afterlink?: string; // After link info to be displayed.
  activitybadge?: {
    // @since 4.3. Activity badge to display near the name.
    badgecontent?: string; // The content to be displayed in the activity badge.
    badgestyle?: string; // The style for the activity badge.
    badgeurl?: string; // An optional URL to redirect the user when the activity badge is clicked.
    badgeelementid?: string; // An optional id in case the module wants to add some code for the activity badge.
    badgeextraattributes?: {
      // An optional array of extra HTML attributes to add to the badge element.
      name?: string; // The attribute name.
      value?: string; // The attribute value.
    }[];
  };
  customdata?: string; // Custom data (JSON encoded).
  noviewlink?: boolean; // Whether the module has no view page.
  completion?: CoreCourseModuleCompletionTracking; // Type of completion tracking: 0 means none, 1 manual, 2 automatic.
  completiondata?: CoreCourseModuleWSCompletionData; // Module completion data.
  contents?: CoreCourseModuleContentFile[];
  groupmode?: number; // @since 4.3. Group mode value
  downloadcontent?: number; // @since 4.0 The download content value.
  dates?: {
    // @since 3.11. Course dates.
    label: string; // Date label.
    timestamp: number; // Date timestamp.
    relativeto?: number; // @since 4.1. Relative date timestamp.
    dataid?: string; // @since 4.1. Cm data id.
  }[];
  contentsinfo?: {
    // @since v3.7.6 Contents summary information.
    filescount: number; // Total number of files.
    filessize: number; // Total files size.
    lastmodified: number; // Last time files were modified.
    mimetypes: string[]; // Files mime types.
    repositorytype?: string; // The repository type for the main file.
  };
};

/**
 * Completion tracking valid values.
 */
export const CoreCourseModuleCompletionTracking = {
  NONE: 0,
  MANUAL: 1,
  AUTOMATIC: 2,
} as const;

export type CoreCourseModuleCompletionTracking =
  (typeof CoreCourseModuleCompletionTracking)[keyof typeof CoreCourseModuleCompletionTracking];

/**
 * Module completion data.
 */
export type CoreCourseModuleWSCompletionData = {
  state: CoreCourseModuleCompletionStatus; // Completion state value.
  timecompleted: number; // Timestamp for completion status.
  overrideby: number | null; // The user id who has overriden the status.
  valueused?: boolean; // Whether the completion status affects the availability of another activity.
  hascompletion?: boolean; // @since 3.11. Whether this activity module has completion enabled.
  isautomatic?: boolean; // @since 3.11. Whether this activity module instance tracks completion automatically.
  istrackeduser?: boolean; // @since 3.11. Whether completion is being tracked for this user.
  uservisible?: boolean; // @since 3.11. Whether this activity is visible to the user.
  details?: CoreCourseModuleWSRuleDetails[]; // @since 3.11. An array of completion details.
  isoverallcomplete?: boolean; // @since 4.4.
  // Whether the overall completion state of this course module should be marked as complete or not.
};

/**
 * Module completion rule details.
 */
export type CoreCourseModuleWSRuleDetails = {
  rulename: string; // Rule name.
  rulevalue: {
    status: number; // Completion status.
    description: string; // Completion description.
  };
};

/**
 * Course Module completion status enumeration.
 */
export const CoreCourseModuleCompletionStatus = {
  COMPLETION_INCOMPLETE: 0,
  COMPLETION_COMPLETE: 1,
  COMPLETION_COMPLETE_PASS: 2,
  COMPLETION_COMPLETE_FAIL: 3,
} as const;

export type CoreCourseModuleCompletionStatus =
  (typeof CoreCourseModuleCompletionStatus)[keyof typeof CoreCourseModuleCompletionStatus];

export type CoreCourseModuleContentFile = CoreWSExternalFile & {
  filename: string; // Filename.
  filepath: string; // Filepath.
  filesize: number; // Filesize.
  timemodified: number; // Time modified.
  type: string; // A file or a folder or external link.
  content?: string; // Raw content, will be used when type is content.
  timecreated: number; // Time created.
  sortorder: number; // Content sort order.
  userid: number; // User who added this content to moodle.
  author: string; // Content owner.
  license: string; // Content license.
  tags?: CoreTagItem[]; // Tags.
};

/**
 * Structure of a tag item returned by WS.
 */
export type CoreTagItem = {
  id: number; // Tag id.
  name: string; // Tag name.
  rawname: string; // The raw, unnormalised name for the tag as entered by users.
  isstandard: boolean; // Whether this tag is standard.
  tagcollid: number; // Tag collection id.
  taginstanceid: number; // Tag instance id.
  taginstancecontextid: number; // Context the tag instance belongs to.
  itemid: number; // Id of the record tagged.
  ordering: number; // Tag ordering.
  flag: number; // Whether the tag is flagged as inappropriate.
  viewurl?: string; // @since 4.4. The url to view the tag.
};

export enum Modname {
  Assign = "assign",
  Folder = "folder",
  H5Pactivity = "h5pactivity",
  Label = "label",
  Questionnaire = "questionnaire",
  Quiz = "quiz",
  Resource = "resource",
  URL = "url",
  Book = "book",
  Page = "page",
}

export type AddonModBookTocChapterParsed = {
  title: string; // Chapter's title.
  level: number; // The chapter's level.
  hidden: string; // The chapter is hidden.
  href: string;
  subitems: AddonModBookTocChapterParsed[];
};
