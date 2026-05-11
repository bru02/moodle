import {
  CoreCourseModuleStandardElements,
  CoreTextFormat,
  CoreWSExternalFile,
  CoreWSExternalWarning,
} from ".";

/**
 * Params of mod_quiz_get_quizzes_by_courses WS.
 */
export type AddonModQuizGetQuizzesByCoursesWSParams = {
  courseids?: number[]; // Array of course ids.
};

/**
 * Data returned by mod_quiz_get_quizzes_by_courses WS.
 */
export type AddonModQuizGetQuizzesByCoursesWSResponse = {
  quizzes: AddonModQuizQuizWSData[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Quiz data returned by mod_quiz_get_quizzes_by_courses WS.
 */
export type AddonModQuizQuizWSData = CoreCourseModuleStandardElements & {
  timeopen?: number; // The time when this quiz opens. (0 = no restriction.).
  timeclose?: number; // The time when this quiz closes. (0 = no restriction.).
  timelimit?: number; // The time limit for quiz attempts, in seconds.
  overduehandling?: string; // The method used to handle overdue attempts. 'autosubmit', 'graceperiod' or 'autoabandon'.
  graceperiod?: number; // The amount of time (in seconds) after time limit during which attempts can still be submitted.
  preferredbehaviour?: string; // The behaviour to ask questions to use.
  canredoquestions?: number; // Allows students to redo any completed question within a quiz attempt.
  attempts?: number; // The maximum number of attempts a student is allowed.
  attemptonlast?: number; // Whether subsequent attempts start from the answer to the previous attempt (1) or start blank (0).
  grademethod?: number; // One of the values QUIZ_GRADEHIGHEST, QUIZ_GRADEAVERAGE, QUIZ_ATTEMPTFIRST or QUIZ_ATTEMPTLAST.
  decimalpoints?: number; // Number of decimal points to use when displaying grades.
  questiondecimalpoints?: number; // Number of decimal points to use when displaying question grades.
  reviewattempt?: number; // Whether users are allowed to review their quiz attempts at various times.
  reviewcorrectness?: number; // Whether users are allowed to review their quiz attempts at various times.
  reviewmaxmarks?: number; // @since 4.3. Whether users are allowed to review their quiz attempts at various times.
  reviewmarks?: number; // Whether users are allowed to review their quiz attempts at various times.
  reviewspecificfeedback?: number; // Whether users are allowed to review their quiz attempts at various times.
  reviewgeneralfeedback?: number; // Whether users are allowed to review their quiz attempts at various times.
  reviewrightanswer?: number; // Whether users are allowed to review their quiz attempts at various times.
  reviewoverallfeedback?: number; // Whether users are allowed to review their quiz attempts at various times.
  questionsperpage?: number; // How often to insert a page break when editing the quiz, or when shuffling the question order.
  navmethod?: AddonModQuizNavMethods; // Any constraints on how the user is allowed to navigate around the quiz.
  shuffleanswers?: number; // Whether the parts of the question should be shuffled, in those question types that support it.
  sumgrades?: number | null; // The total of all the question instance maxmarks.
  grade?: number; // The total that the quiz overall grade is scaled to be out of.
  timecreated?: number; // The time when the quiz was added to the course.
  timemodified?: number; // Last modified time.
  password?: string; // A password that the student must enter before starting or continuing a quiz attempt.
  subnet?: string; // Used to restrict the IP addresses from which this quiz can be attempted.
  browsersecurity?: string; // Restriciton on the browser the student must use. E.g. 'securewindow'.
  delay1?: number; // Delay that must be left between the first and second attempt, in seconds.
  delay2?: number; // Delay that must be left between the second and subsequent attempt, in seconds.
  showuserpicture?: number; // Option to show the user's picture during the attempt and on the review page.
  showblocks?: number; // Whether blocks should be shown on the attempt.php and review.php pages.
  completionattemptsexhausted?: number; // Mark quiz complete when the student has exhausted the maximum number of attempts.
  completionpass?: number; // Whether to require passing grade.
  allowofflineattempts?: number; // Whether to allow the quiz to be attempted offline in the mobile app.
  autosaveperiod?: number; // Auto-save delay.
  hasfeedback?: number; // Whether the quiz has any non-blank feedback text.
  hasquestions?: number; // Whether the quiz has questions.
};

/**
 * Possible navigation methods for a quiz.
 */
export const AddonModQuizNavMethods = {
  FREE: "free",
  SEQ: "sequential",
} as const;

export type AddonModQuizNavMethods =
  (typeof AddonModQuizNavMethods)[keyof typeof AddonModQuizNavMethods];

/**
 * Params of mod_quiz_get_quiz_access_information WS.
 */
export type AddonModQuizGetQuizAccessInformationWSParams = {
  quizid: number; // Quiz instance id.
};

/**
 * Data returned by mod_quiz_get_quiz_access_information WS.
 */
export type AddonModQuizGetQuizAccessInformationWSResponse = {
  canattempt: boolean; // Whether the user can do the quiz or not.
  canmanage: boolean; // Whether the user can edit the quiz settings or not.
  canpreview: boolean; // Whether the user can preview the quiz or not.
  canreviewmyattempts: boolean; // Whether the users can review their previous attempts or not.
  canviewreports: boolean; // Whether the user can view the quiz reports or not.
  accessrules: string[]; // List of rules.
  activerulenames: string[]; // List of active rules.
  preventaccessreasons: string[]; // List of reasons.
  warnings?: CoreWSExternalWarning[];
};

/**
 * Params of mod_quiz_start_attempt WS.
 */
export type AddonModQuizStartAttemptWSParams = {
  quizid: number; // Quiz instance id.
  preflightdata?: AddonModQuizPreflightDataWSParam[]; // Preflight required data (like passwords).
  forcenew?: boolean; // Whether to force a new attempt or not.
} & Partial<
  Record<
    `preflightdata[${number}][name]` | `preflightdata[${number}][value]`,
    string
  >
>;

/**
 * Data returned by mod_quiz_start_attempt WS.
 */
export type AddonModQuizStartAttemptWSResponse = {
  attempt: AddonModQuizAttemptWSData;
  warnings?: CoreWSExternalWarning[];
};

/**
 * Preflight data in the format accepted by the WebServices.
 */
export type AddonModQuizPreflightDataWSParam = {
  name: string; // Data name.
  value: string; // Data value.
};

/**
 * Params of mod_quiz_get_user_best_grade WS.
 */
export type AddonModQuizGetUserBestGradeWSParams = {
  quizid: number; // Quiz instance id.
  userid?: number; // User id.
};

/**
 * Data returned by mod_quiz_get_user_best_grade WS.
 */
export type AddonModQuizGetUserBestGradeWSResponse = {
  hasgrade: boolean; // Whether the user has a grade on the given quiz.
  grade?: number; // The grade (only if the user has a grade).
  gradetopass?: number; // @since 3.11. The grade to pass the quiz (only if set).
  warnings?: CoreWSExternalWarning[];
};

/**
 * Params of mod_quiz_get_user_attempts WS.
 */
export type AddonModQuizGetUserAttemptsWSParams = {
  quizid: number; // Quiz instance id.
  userid?: number; // User id, empty for current user.
  status?: string; // Quiz status: all, finished or unfinished.
  includepreviews?: boolean; // Whether to include previews or not.
};

/**
 * Data returned by mod_quiz_get_user_attempts WS.
 */
export type AddonModQuizGetUserAttemptsWSResponse = {
  attempts: AddonModQuizAttemptWSData[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Attempt data returned by several WebServices.
 */
export type AddonModQuizAttemptWSData = {
  id: number; // Attempt id.
  quiz?: number; // Foreign key reference to the quiz that was attempted.
  userid?: number; // Foreign key reference to the user whose attempt this is.
  attempt?: number; // Sequentially numbers this students attempts at this quiz.
  uniqueid?: number; // Foreign key reference to the question_usage that holds the details of the the question_attempts.
  layout?: string; // Attempt layout.
  currentpage?: number; // Attempt current page.
  preview?: number; // Whether is a preview attempt or not.
  state?: string; // The current state of the attempts. 'inprogress', 'overdue', 'finished' or 'abandoned'.
  timestart?: number; // Time when the attempt was started.
  timefinish?: number; // Time when the attempt was submitted. 0 if the attempt has not been submitted yet.
  timemodified?: number; // Last modified time.
  timemodifiedoffline?: number; // Last modified time via webservices.
  timecheckstate?: number; // Next time quiz cron should check attempt for state changes. NULL means never check.
  sumgrades?: number | null; // Total marks for this attempt.
  gradeitemmarks?: {
    // @since 4.4. If the quiz has additional grades set up, the mark for each grade for this attempt.
    name: string; // The name of this grade item.
    grade: number; // The grade this attempt earned for this item.
    maxgrade: number; // The total this grade is out of.
  }[];
};

/**
 * Params of mod_quiz_get_quiz_feedback_for_grade WS.
 */
export type AddonModQuizGetQuizFeedbackForGradeWSParams = {
  quizid: number; // Quiz instance id.
  grade: number; // The grade to check.
};

/**
 * Data returned by mod_quiz_get_quiz_feedback_for_grade WS.
 */
export type AddonModQuizGetQuizFeedbackForGradeWSResponse = {
  feedbacktext: string; // The comment that corresponds to this grade (empty for none).
  feedbacktextformat?: CoreTextFormat; // Feedbacktext format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
  feedbackinlinefiles?: CoreWSExternalFile[];
  warnings?: CoreWSExternalWarning[];
};
