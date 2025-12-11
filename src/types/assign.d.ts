import { CoreTextFormat, CoreWSExternalFile, CoreWSExternalWarning } from ".";

/**
 * Params of mod_assign_get_submission_status WS.
 */
export type AddonModAssignGetSubmissionStatusWSParams = {
  assignid: number; // Assignment instance id.
  userid?: number; // User id (empty for current user).
  groupid?: number; // Filter by users in group (used for generating the grading summary). Empty or 0 for all groups information.
};

/**
 * Result of WS mod_assign_get_submission_status.
 */
export type AddonModAssignGetSubmissionStatusWSResponse = {
  gradingsummary?: AddonModAssignSubmissionGradingSummary; // Grading information.
  lastattempt?: AddonModAssignSubmissionAttempt; // Last attempt information.
  feedback?: AddonModAssignSubmissionFeedback; // Feedback for the last attempt.
  previousattempts?: AddonModAssignSubmissionPreviousAttempt[]; // List all the previous attempts did by the user.
  assignmentdata?: {
    // @since 4.0. Extra information about assignment.
    attachments?: {
      // Intro and activity attachments.
      intro?: CoreWSExternalFile[]; // Intro attachments files.
      activity?: CoreWSExternalFile[]; // Activity attachments files.
    };
    activity?: string; // Text of activity.
    activityformat?: CoreTextFormat; // Format of activity.
  };
  warnings?: CoreWSExternalWarning[];
};

/**
 * Grading summary of an assign submission.
 */
export type AddonModAssignSubmissionGradingSummary = {
  participantcount: number; // Number of users who can submit.
  submissiondraftscount: number; // Number of submissions in draft status.
  submissionsenabled: boolean; // Whether submissions are enabled or not.
  submissionssubmittedcount: number; // Number of submissions in submitted status.
  submissionsneedgradingcount: number; // Number of submissions that need grading.
  warnofungroupedusers: string | boolean; // Whether we need to warn people about groups.
};

/**
 * Attempt of an assign submission.
 */
export type AddonModAssignSubmissionAttempt = {
  submission?: AddonModAssignSubmission; // Submission info.
  teamsubmission?: AddonModAssignSubmission; // Submission info.
  submissiongroup?: number; // The submission group id (for group submissions only).
  submissiongroupmemberswhoneedtosubmit?: number[]; // List of users who still need to submit (for group submissions only).
  submissionsenabled: boolean; // Whether submissions are enabled or not.
  locked: boolean; // Whether new submissions are locked.
  graded: boolean; // Whether the submission is graded.
  canedit: boolean; // Whether the user can edit the current submission.
  caneditowner?: boolean; // Whether the owner of the submission can edit it.
  cansubmit: boolean; // Whether the user can submit.
  extensionduedate: number; // Extension due date.
  blindmarking: boolean; // Whether blind marking is enabled.
  gradingstatus: AddonModAssignGradingStates; // Grading status.
  usergroups: number[]; // User groups in the course.
  timelimit?: number; // @since 4.0. Time limit for submission.
};

/**
 * Previous attempt of an assign submission.
 */
export type AddonModAssignSubmissionPreviousAttempt = {
  attemptnumber: number; // Attempt number.
  submission?: AddonModAssignSubmission; // Submission info.
  grade?: AddonModAssignGrade; // Grade information.
  feedbackplugins?: AddonModAssignPlugin[]; // Feedback info.
};

/**
 * Feedback of an assign submission.
 */
export type AddonModAssignSubmissionFeedback = {
  grade?: AddonModAssignGrade; // Grade information.
  gradefordisplay: string; // Grade rendered into a format suitable for display.
  gradeddate: number; // The date the user was graded.
  plugins?: AddonModAssignPlugin[]; // Plugins info.
};

/**
 * Assign submission returned by mod_assign_get_submissions.
 */
export type AddonModAssignSubmission = {
  id: number; // Submission id.
  userid: number; // Student id.
  attemptnumber: number; // Attempt number.
  timecreated: number; // Submission creation time.
  timemodified: number; // Submission last modified time.
  status: AddonModAssignSubmissionStatusValues; // Submission status.
  groupid: number; // Group id.
  assignment?: number; // Assignment id.
  latest?: number; // Latest attempt.
  plugins?: AddonModAssignPlugin[]; // Plugins.
  gradingstatus?: AddonModAssignGradingStates; // Grading status.
  timestarted?: number; // @since 4.0. Submission start time.
};

/**
 * Assign plugin.
 */
export type AddonModAssignPlugin = {
  type: string; // Submission plugin type.
  name: string; // Submission plugin name.
  fileareas?: {
    // Fileareas.
    area: string; // File area.
    files?: CoreWSExternalFile[];
  }[];
  editorfields?: {
    // Editorfields.
    name: string; // Field name.
    description: string; // Field description.
    text: string; // Field value.
    format: CoreTextFormat; // Text format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
  }[];
};

/**
 * Submission status.
 * Constants on LMS starting with ASSIGN_SUBMISSION_STATUS_
 */
export const AddonModAssignSubmissionStatusValues = {
  SUBMITTED: "submitted",
  DRAFT: "draft",
  NEW: "new",
  REOPENED: "reopened",
  // Added by App Statuses.
  NO_ATTEMPT: "noattempt",
  NO_ONLINE_SUBMISSIONS: "noonlinesubmissions",
  NO_SUBMISSION: "nosubmission",
  GRADED_FOLLOWUP_SUBMIT: "gradedfollowupsubmit",
} as const;

export type AddonModAssignSubmissionStatusValues =
  (typeof AddonModAssignSubmissionStatusValues)[keyof typeof AddonModAssignSubmissionStatusValues];

/**
 * Grading status.
 * Constants on LMS starting with ASSIGN_GRADING_STATUS_
 */
export const AddonModAssignGradingStates = {
  GRADED: "graded",
  NOT_GRADED: "notgraded",
  // Added by App Statuses.
  MARKING_WORKFLOW_STATE_RELEASED: "released", // with ASSIGN_MARKING_WORKFLOW_STATE_RELEASED
  GRADED_FOLLOWUP_SUBMIT: "gradedfollowupsubmit",
} as const;

export type AddonModAssignGradingStates =
  (typeof AddonModAssignGradingStates)[keyof typeof AddonModAssignGradingStates];

/**
 * Grade of an assign, returned by mod_assign_get_grades.
 */
export type AddonModAssignGrade = {
  id: number; // Grade id.
  assignment?: number; // Assignment id.
  userid: number; // Student id.
  attemptnumber: number; // Attempt number.
  timecreated: number; // Grade creation time.
  timemodified: number; // Grade last modified time.
  grader: number; // Grader, -1 if grader is hidden.
  grade: string; // Grade.
  gradefordisplay?: string; // Grade rendered into a format suitable for display.
};

/**
 * Params of mod_assign_get_assignments WS.
 */
export type AddonModAssignGetAssignmentsWSParams = {
  courseids?: number[]; // 0 or more course ids.
  capabilities?: string[]; // List of capabilities used to filter courses.
  includenotenrolledcourses?: boolean; // Whether to return courses that the user can see even if is not enroled in.
  // This requires the parameter courseids to not be empty.
};

/**
 * Assign data returned by mod_assign_get_assignments.
 */
export type AddonModAssignAssign = {
  id: number; // Assignment id.
  cmid: number; // Course module id.
  course: number; // Course id.
  name: string; // Assignment name.
  nosubmissions: number; // No submissions.
  submissiondrafts: number; // Submissions drafts.
  sendnotifications: number; // Send notifications.
  sendlatenotifications: number; // Send notifications.
  sendstudentnotifications: number; // Send student notifications (default).
  duedate: number; // Assignment due date.
  allowsubmissionsfromdate: number; // Allow submissions from date.
  grade: number; // Grade type.
  timemodified: number; // Last time assignment was modified.
  completionsubmit: number; // If enabled, set activity as complete following submission.
  cutoffdate: number; // Date after which submission is not accepted without an extension.
  gradingduedate?: number; // The expected date for marking the submissions.
  teamsubmission: number; // If enabled, students submit as a team.
  requireallteammemberssubmit: number; // If enabled, all team members must submit.
  teamsubmissiongroupingid: number; // The grouping id for the team submission groups.
  blindmarking: number; // If enabled, hide identities until reveal identities actioned.
  hidegrader?: number; // @since 3.7. If enabled, hide grader to student.
  revealidentities: number; // Show identities for a blind marking assignment.
  attemptreopenmethod: AddonModAssignAttemptReopenMethodValues; // Method used to control opening new attempts.
  maxattempts: number; // Maximum number of attempts allowed.
  markingworkflow: number; // Enable marking workflow.
  markingallocation: number; // Enable marking allocation.
  requiresubmissionstatement: number; // Student must accept submission statement.
  preventsubmissionnotingroup?: number; // Prevent submission not in group.
  submissionstatement?: string; // Submission statement formatted.
  submissionstatementformat?: CoreTextFormat; // Submissionstatement format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
  configs: AddonModAssignConfig[]; // Configuration settings.
  intro?: string; // Assignment intro, not allways returned because it deppends on the activity configuration.
  introformat?: CoreTextFormat; // Intro format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
  introfiles?: CoreWSExternalFile[];
  introattachments?: CoreWSExternalFile[];
  activity?: string; // @since 4.0. Description of activity.
  activityformat?: CoreTextFormat; // @since 4.0. Format of activity.
  activityattachments?: CoreWSExternalFile[]; // @since 4.0. Files from activity field.
  timelimit?: number; // @since 4.0. Time limit to complete assigment.
  submissionattachments?: number; // @since 4.0. Flag to only show files during submission.
};

/**
 * Config setting in an assign.
 */
export type AddonModAssignConfig = {
  id?: number; // Assign_plugin_config id.
  assignment?: number; // Assignment id.
  plugin: string; // Plugin.
  subtype: string; // Subtype.
  name: string; // Name.
  value: string; // Value.
};

/**
 * Reopen attempt methods.
 * Constants on LMS starting with ASSIGN_ATTEMPT_REOPEN_METHOD_
 */
export const AddonModAssignAttemptReopenMethodValues = {
  NONE: "none",
  MANUAL: "manual",
  AUTOMATIC: "automatic",
  UNTILPASS: "untilpass",
} as const;

export type AddonModAssignAttemptReopenMethodValues =
  (typeof AddonModAssignAttemptReopenMethodValues)[keyof typeof AddonModAssignAttemptReopenMethodValues];

/**
 * Data returned by mod_assign_get_assignments WS.
 */
export type AddonModAssignGetAssignmentsWSResponse = {
  courses: {
    id: number; // Course id.
    fullname: string; // Course fullname.
    shortname: string; // Course shortname.
    timemodified: number; // Course last modified time.
    assignments: AddonModAssignAssign[]; // Assignments within the course.
  }[];
  warnings?: CoreWSExternalWarning[];
};
