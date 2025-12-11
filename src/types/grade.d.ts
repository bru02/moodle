/**
 * Params of gradereport_user_get_grades_table WS.
 */
export type CoreGradesGetUserGradesTableWSParams = {
  courseid: number; // Course Id.
  userid?: number; // Return grades only for this user (optional).
  groupid?: number; // Get users from this group only.
};

/**
 * Params of gradereport_overview_get_course_grades WS.
 */
export type CoreGradesGetOverviewCourseGradesWSParams = {
  userid?: number; // Get grades for this user (optional, default current).
};

/**
 * Params of gradereport_user_get_access_information WS.
 */
export type CoreGradesGetUserAccessInformationWSParams = {
  courseid: number; // Id of the course.
};

/**
 * Data returned by gradereport_user_get_grade_items WS.
 */
export type CoreGradesGetUserGradeItemsWSResponse = {
  usergrades: {
    courseid: number; // Course id.
    userid: number; // User id.
    userfullname: string; // User fullname.
    useridnumber: string; // User idnumber.
    maxdepth: number; // Table max depth (needed for printing it).
    gradeitems: CoreGradesGradeItem[];
  }[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Data returned by gradereport_user_get_grades_table WS.
 */
export type CoreGradesGetUserGradesTableWSResponse = {
  tables: CoreGradesTable[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Data returned by gradereport_overview_get_course_grades WS.
 */
export type CoreGradesGetOverviewCourseGradesWSResponse = {
  grades: CoreGradesGradeOverview[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Data returned by gradereport_user_get_access_information WS.
 */
export type CoreGradesGetUserAccessInformationWSResponse = {
  canviewusergradereport: boolean;
  canviewmygrades: boolean;
  canviewallgrades: boolean;
};

/**
 * Grade item data.
 */
export type CoreGradesGradeItem = {
  id: number; // Grade item id.
  itemname: string; // Grade item name.
  itemtype: string; // Grade item type.
  itemmodule: string; // Grade item module.
  iteminstance: number; // Grade item instance.
  itemnumber: number; // Grade item item number.
  idnumber: string; // Grade item idnumber.
  categoryid: number; // Grade item category id.
  outcomeid: number; // Outcome id.
  scaleid: number; // Scale id.
  locked?: boolean; // Grade item for user locked?.
  cmid?: number; // Course module id (if type mod).
  weightraw?: number; // Weight raw.
  weightformatted?: string; // Weight.
  status?: string; // Status.
  graderaw?: SafeNumber; // Grade raw.
  gradedatesubmitted?: number; // Grade submit date.
  gradedategraded?: number; // Grade graded date.
  gradehiddenbydate?: boolean; // Grade hidden by date?.
  gradeneedsupdate?: boolean; // Grade needs update?.
  gradeishidden?: boolean; // Grade is hidden?.
  gradeislocked?: boolean; // Grade is locked?.
  gradeisoverridden?: boolean; // Grade overridden?.
  gradeformatted?: string; // The grade formatted.
  grademin?: number; // Grade min.
  grademax?: number; // Grade max.
  rangeformatted?: string; // Range formatted.
  percentageformatted?: string; // Percentage.
  lettergradeformatted?: string; // Letter grade.
  rank?: number; // Rank in the course.
  numusers?: number; // Num users in course.
  averageformatted?: string; // Grade average.
  feedback?: string; // Grade feedback.
  feedbackformat?: CoreTextFormat; // Feedback format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
};

/**
 * Grade table data.
 */
export type CoreGradesTable = {
  courseid: number; // Course id.
  userid: number; // User id.
  userfullname: string; // User fullname.
  maxdepth: number; // Table max depth (needed for printing it).
  tabledata: CoreGradesTableRow[];
};

/**
 * Grade table data item.
 */
export type CoreGradesTableRow = {
  itemname?: CoreGradesTableItemNameColumn; // The item returned data.
  leader?: CoreGradesTableLeaderColumn; // The item returned data.
  weight?: CoreGradesTableCommonColumn; // Weight column.
  grade?: CoreGradesTableCommonColumn; // Grade column.
  range?: CoreGradesTableCommonColumn; // Range column.
  percentage?: CoreGradesTableCommonColumn; // Percentage column.
  lettergrade?: CoreGradesTableCommonColumn; // Lettergrade column.
  rank?: CoreGradesTableCommonColumn; // Rank column.
  average?: CoreGradesTableCommonColumn; // Average column.
  feedback?: CoreGradesTableCommonColumn; // Feedback column.
  contributiontocoursetotal?: CoreGradesTableCommonColumn; // Contributiontocoursetotal column.
};

/**
 * Grade table common column data.
 */
export type CoreGradesTableCommonColumn = {
  class: string; // Class.
  content: string; // Cell content.
  headers: string; // Headers.
};

/**
 * Grade table item name column.
 */
export type CoreGradesTableItemNameColumn = {
  class: string; // Class.
  colspan: number; // Col span.
  content: string; // Cell content.
  celltype: string; // Cell type.
  id: string; // Id.
};

/**
 * Grade table leader column.
 */
export type CoreGradesTableLeaderColumn = {
  class: string; // Class.
  rowspan: number; // Row span.
  content: undefined; // The WS doesn't return this data, but we declare it to make it coherent with the other columns.
};

/**
 * Grade table column.
 */
export type CoreGradesTableColumn =
  | CoreGradesTableCommonColumn
  | CoreGradesTableItemNameColumn
  | CoreGradesTableLeaderColumn;

/**
 * Grade overview data.
 */
export type CoreGradesGradeOverview = {
  courseid: number; // Course id.
  grade: string; // Grade formatted.
  rawgrade: string; // Raw grade, not formatted.
  rank?: number; // Your rank in the course.
};
