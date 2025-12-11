import type { ArrayValuesToIndexedAccess } from ".";
import type {
  AddonModAssignGetAssignmentsWSParams,
  AddonModAssignGetAssignmentsWSResponse,
  AddonModAssignGetSubmissionStatusWSParams,
  AddonModAssignGetSubmissionStatusWSResponse,
} from "./assign";
import type { CoreCommentsGetCommentsWSParams, CoreCommentsGetCommentsWSResponse } from "./comment";
import { CoreCourseGetContentsWSResponse } from "./contents";
import type { CoreEnrolGetUsersCoursesWSParams, CoreEnrolGetUsersCoursesWSResponse } from "./course";
import type {
  AddonModForumGetDiscussionPostsWSParams,
  AddonModForumGetDiscussionPostsWSResponse,
  AddonModForumGetForumDiscussionsWSParams,
  AddonModForumGetForumDiscussionsWSResponse,
  AddonModForumGetForumsByCoursesWSParams,
  AddonModForumGetForumsByCoursesWSResponse,
} from "./forum";
import type {
  CoreGradesGetOverviewCourseGradesWSParams,
  CoreGradesGetOverviewCourseGradesWSResponse,
  CoreGradesGetUserAccessInformationWSParams,
  CoreGradesGetUserAccessInformationWSResponse,
  CoreGradesGetUserGradesTableWSParams,
  CoreGradesGetUserGradesTableWSResponse,
} from "./grade";
import type {
  AddonModQuizGetQuizAccessInformationWSParams,
  AddonModQuizGetQuizAccessInformationWSResponse,
  AddonModQuizGetQuizFeedbackForGradeWSParams,
  AddonModQuizGetQuizFeedbackForGradeWSResponse,
  AddonModQuizGetQuizzesByCoursesWSParams,
  AddonModQuizGetQuizzesByCoursesWSResponse,
  AddonModQuizGetUserAttemptsWSParams,
  AddonModQuizGetUserAttemptsWSResponse,
  AddonModQuizGetUserBestGradeWSParams,
  AddonModQuizGetUserBestGradeWSResponse,
} from "./quiz";

export type WSResponseMap = {
  core_enrol_get_users_courses: CoreEnrolGetUsersCoursesWSResponse;
  core_comment_get_comments: CoreCommentsGetCommentsWSResponse;
  gradereport_user_get_grades_table: CoreGradesGetUserGradesTableWSResponse;
  gradereport_overview_get_course_grades: CoreGradesGetOverviewCourseGradesWSResponse;
  gradereport_user_get_access_information: CoreGradesGetUserAccessInformationWSResponse;
  mod_assign_get_submission_status: AddonModAssignGetSubmissionStatusWSResponse;
  mod_assign_get_assignments: AddonModAssignGetAssignmentsWSResponse;
  mod_forum_get_forums_by_courses: AddonModForumGetForumsByCoursesWSResponse;
  mod_forum_get_forum_discussions: AddonModForumGetForumDiscussionsWSResponse;
  mod_forum_get_discussion_posts: AddonModForumGetDiscussionPostsWSResponse;
  mod_quiz_get_quizzes_by_courses: AddonModQuizGetQuizzesByCoursesWSResponse;
  mod_quiz_get_quiz_access_information: AddonModQuizGetQuizAccessInformationWSResponse;
  mod_quiz_get_user_best_grade: AddonModQuizGetUserBestGradeWSResponse;
  mod_quiz_get_user_attempts: AddonModQuizGetUserAttemptsWSResponse;
  mod_quiz_get_quiz_feedback_for_grade: AddonModQuizGetQuizFeedbackForGradeWSResponse;
  core_course_get_contents: CoreCourseGetContentsWSResponse;
};

export type WSParamsMap = {
  core_enrol_get_users_courses: CoreEnrolGetUsersCoursesWSParams;
  core_comment_get_comments: CoreCommentsGetCommentsWSParams;
  gradereport_user_get_grades_table: CoreGradesGetUserGradesTableWSParams;
  gradereport_overview_get_course_grades: CoreGradesGetOverviewCourseGradesWSParams;
  gradereport_user_get_access_information: CoreGradesGetUserAccessInformationWSParams;
  mod_assign_get_submission_status: AddonModAssignGetSubmissionStatusWSParams;
  mod_assign_get_assignments: ArrayValuesToIndexedAccess<AddonModAssignGetAssignmentsWSParams>;
  mod_forum_get_forums_by_courses: ArrayValuesToIndexedAccess<AddonModForumGetForumsByCoursesWSParams>;
  mod_forum_get_forum_discussions: AddonModForumGetForumDiscussionsWSParams;
  mod_forum_get_discussion_posts: AddonModForumGetDiscussionPostsWSParams;
  mod_quiz_get_quizzes_by_courses: ArrayValuesToIndexedAccess<AddonModQuizGetQuizzesByCoursesWSParams>;
  mod_quiz_get_quiz_access_information: AddonModQuizGetQuizAccessInformationWSParams;
  mod_quiz_get_user_best_grade: AddonModQuizGetUserBestGradeWSParams;
  mod_quiz_get_user_attempts: AddonModQuizGetUserAttemptsWSParams;
  mod_quiz_get_quiz_feedback_for_grade: AddonModQuizGetQuizFeedbackForGradeWSParams;
  core_course_get_contents: CoreCourseGetContentsParams;
};
