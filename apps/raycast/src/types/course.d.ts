import { CoreTextFormat, CoreWSExternalFile } from ".";

/**
 * Params of core_enrol_get_users_courses WS.
 */
export type CoreEnrolGetUsersCoursesWSParams = {
  userid: number; // User id.
  returnusercount?: boolean; // Include count of enrolled users for each course? This can add several seconds to the response
  // time if a user is on several large courses, so set this to false if the value will not be used to improve performance.
};

/**
 * Data returned by core_enrol_get_users_courses WS.
 */
export type CoreEnrolGetUsersCoursesWSResponse = (CoreEnrolledCourseData & {
  category?: number; // Course category id.
})[];

/**
 * Basic data obtained form any course.
 */
export type CoreCourseBasicData = {
  id: string; // Course id.
  fullname: string; // Course full name.
  displayname: string; // Course display name.
  shortname: string; // Course short name.
  summary: string; // Summary.
  summaryformat?: CoreTextFormat; // Summary format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
  categoryid?: number; // Course category id.
  courseimage: string; // Course image (url).
};

/**
 * Basic data obtained from a course when the user is enrolled.
 */
export type CoreEnrolledCourseBasicData = CoreCourseBasicData & {
  idnumber?: string; // Id number of course.
  visible?: number; // 1 means visible, 0 means not yet visible course.
  format?: string; // Course format: weeks, topics, social, site.
  showgrades?: boolean; // True if grades are shown, otherwise false.
  lang?: string; // Forced course language.
  enablecompletion?: boolean; // True if completion is enabled, otherwise false.
  startdate?: number; // Timestamp when the course start.
  enddate?: number; // Timestamp when the course end.
};

/**
 * Course Data model received when the user is enrolled.
 */
export type CoreEnrolledCourseData = CoreEnrolledCourseBasicData & {
  enrolledusercount?: number; // Number of enrolled users in this course.
  completionhascriteria?: boolean; // If completion criteria is set.
  completionusertracked?: boolean; // If the user is completion tracked.
  progress?: number | null; // Progress percentage.
  completed?: boolean; //  @since 3.6. Whether the course is completed.
  marker?: number; //  @since 3.6. Course section marker.
  lastaccess?: number; // @since 3.6. Last access to the course (timestamp).
  isfavourite?: boolean; // If the user marked this course a favourite.
  hidden?: boolean; // If the user hide the course from the dashboard.
  overviewfiles?: CoreWSExternalFile[]; // @since 3.6.
  showactivitydates?: boolean; // @since 3.11. Whether the activity dates are shown or not.
  showcompletionconditions?: boolean; // @since 3.11. Whether the activity completion conditions are shown or not.
  timemodified: number; // @since 4.0. Last time course settings were updated (timestamp).
};
