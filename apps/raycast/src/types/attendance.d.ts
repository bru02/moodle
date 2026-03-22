import { CoreTextFormat } from ".";

/**
 * Params of mod_attendance_get_courses_with_today_sessions WS.
 */
export type AddonModAttendanceGetCoursesWithTodaySessionsWSParams = {
  userid?: number; // User id (0 for current user).
};

/**
 * Attendance session status.
 */
export type AddonModAttendanceStatus = {
  id: number; // Status id.
  attendanceid: number; // Attendance id.
  acronym: string; // Status acronym.
  description: string; // Status description.
  grade: number; // Grade value.
  visible: number; // Status visibility.
  deleted: number; // Whether this status was deleted.
  setnumber: number; // Status set number.
};

/**
 * Attendance log entry for a session.
 */
export type AddonModAttendanceLog = {
  studentid: number; // Student id.
  statusid: string; // Last status id.
  remarks: string; // Last remarks.
  id: string; // Log id.
};

/**
 * User returned in attendance session data.
 */
export type AddonModAttendanceUser = {
  id: number; // User id.
  firstname: string; // User first name.
  lastname: string; // User last name.
};

/**
 * Base attendance session structure.
 */
export type AddonModAttendanceBaseSession = {
  id: number; // Session id.
  attendanceid: number; // Attendance id.
  groupid: number; // Group id.
  sessdate: number; // Session date timestamp.
  duration: number; // Session duration in seconds.
  lasttaken: number; // Session last taken time.
  lasttakenby: number; // Id of the last user that took this session.
  timemodified: number; // Time modified.
  description: string; // Session description.
  descriptionformat: CoreTextFormat; // Session description format.
  studentscanmark: number; // Whether students can self-mark.
  absenteereport: number; // Included in absentee reports.
  autoassignstatus: number; // Auto-assign status.
  preventsharedip: number; // Prevent shared IP.
  preventsharediptime: number; // Delay before shared IP allowed again.
  statusset: number; // Session status set.
  includeqrcode: number; // Include QR code for passwords.
  studentsearlyopentime: number; // Early open time in seconds.
};

/**
 * Session returned by mod_attendance_get_courses_with_today_sessions.
 */
export type AddonModAttendanceTodaySession = AddonModAttendanceBaseSession;

/**
 * Attendance session returned by mod_attendance_get_session and mod_attendance_get_sessions.
 */
export type AddonModAttendanceSession = AddonModAttendanceBaseSession & {
  courseid: number; // Course id.
  statuses: AddonModAttendanceStatus[]; // Available statuses.
  attendance_log: AddonModAttendanceLog[]; // User attendance logs.
  users: AddonModAttendanceUser[]; // Users in this session.
};

/**
 * Attendance instance returned by mod_attendance_get_courses_with_today_sessions.
 */
export type AddonModAttendanceInstanceWithTodaySessions = {
  name: string; // Attendance name.
  today_sessions: AddonModAttendanceTodaySession[]; // Sessions active today.
};

/**
 * Course returned by mod_attendance_get_courses_with_today_sessions.
 */
export type AddonModAttendanceCourseWithTodaySessions = {
  shortname: string; // Course short name.
  fullname: string; // Course full name.
  attendance_instances:
    | AddonModAttendanceInstanceWithTodaySessions[]
    | Record<string, AddonModAttendanceInstanceWithTodaySessions>;
};

/**
 * Data returned by mod_attendance_get_courses_with_today_sessions WS.
 */
export type AddonModAttendanceGetCoursesWithTodaySessionsWSResponse = AddonModAttendanceCourseWithTodaySessions[];

/**
 * Params of mod_attendance_get_session WS.
 */
export type AddonModAttendanceGetSessionWSParams = {
  sessionid: number; // Session id.
};

/**
 * Data returned by mod_attendance_get_session WS.
 */
export type AddonModAttendanceGetSessionWSResponse = AddonModAttendanceSession;

/**
 * Params of mod_attendance_get_sessions WS.
 */
export type AddonModAttendanceGetSessionsWSParams = {
  attendanceid: number; // Attendance id.
};

/**
 * Data returned by mod_attendance_get_sessions WS.
 */
export type AddonModAttendanceGetSessionsWSResponse = AddonModAttendanceSession[];

/**
 * Params of mod_attendance_update_user_status WS.
 */
export type AddonModAttendanceUpdateUserStatusWSParams = {
  sessionid: number; // Session id.
  studentid: number; // Student id.
  takenbyid: number; // Id of the user who took this session.
  statusid: number; // Status id.
  statusset: number | string; // Status set of session.
};

/**
 * Data returned by mod_attendance_update_user_status WS.
 */
export type AddonModAttendanceUpdateUserStatusWSResponse = string;

/**
 * Params of mod_attendance_mobile_view_activity WS.
 */
export type AddonModAttendanceMobileViewActivityWSParams = {
  cmid: number; // Course module id.
  courseid: number; // Course id.
  status?: number | string; // Optional selected status id.
  sessid?: number; // Optional session id.
  studentpass?: string; // Optional student password.
};

/**
 * Mobile template returned by attendance mobile view handlers.
 */
export type AddonModAttendanceMobileTemplate = {
  id?: string;
  html?: string;
};

/**
 * Data returned by mod_attendance_mobile_view_activity.
 */
export type AddonModAttendanceMobileViewActivityWSResponse = {
  templates?: AddonModAttendanceMobileTemplate[];
  javascript?: string;
  otherdata?: unknown;
};
