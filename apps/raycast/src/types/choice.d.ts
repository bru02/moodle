import { CoreCourseModuleStandardElements, CoreWSExternalWarning } from ".";

/**
 * Params of mod_choice_get_choices_by_courses WS.
 */
export type AddonModChoiceGetChoicesByCoursesWSParams = {
  courseids?: number[]; // Array of course ids.
};

/**
 * Data returned by mod_choice_get_choices_by_courses WS.
 */
export type AddonModChoiceGetChoicesByCoursesWSResponse = {
  choices: AddonModChoiceChoice[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Choice data returned by mod_choice_get_choices_by_courses WS.
 */
export type AddonModChoiceChoice = CoreCourseModuleStandardElements & {
  publish?: boolean; // If choice is published.
  showresults?: AddonModChoiceShowResults; // 0 never, 1 after answer, 2 after close, 3 always.
  display?: number; // Display mode (vertical, horizontal).
  allowupdate?: boolean; // Whether user can update submitted response.
  allowmultiple?: boolean; // Whether multiple options can be selected.
  showunanswered?: boolean; // Show users that did not answer yet.
  includeinactive?: boolean; // Include inactive users.
  limitanswers?: boolean; // Whether answer capacity is limited.
  timeopen?: number; // Open date timestamp.
  timeclose?: number; // Close date timestamp.
  showpreview?: boolean; // Show preview before opening date.
  timemodified?: number; // Last modified timestamp.
  completionsubmit?: boolean; // Completion when submitting response.
  showavailable?: boolean; // Show available spaces.
};

/**
 * Choice result visibility values.
 */
export const AddonModChoiceShowResults = {
  SHOWRESULTS_NOT: 0,
  SHOWRESULTS_AFTER_ANSWER: 1,
  SHOWRESULTS_AFTER_CLOSE: 2,
  SHOWRESULTS_ALWAYS: 3,
} as const;

export type AddonModChoiceShowResults =
  (typeof AddonModChoiceShowResults)[keyof typeof AddonModChoiceShowResults];

/**
 * Params of mod_choice_get_choice_options WS.
 */
export type AddonModChoiceGetChoiceOptionsWSParams = {
  choiceid: number; // Choice instance id.
};

/**
 * Data returned by mod_choice_get_choice_options WS.
 */
export type AddonModChoiceGetChoiceOptionsWSResponse = {
  options: AddonModChoiceOption[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Choice option returned by mod_choice_get_choice_options WS.
 */
export type AddonModChoiceOption = {
  id: number; // Option id.
  text: string; // Option text.
  maxanswers: number; // Maximum number of answers for this option.
  displaylayout: boolean; // True for horizontal, otherwise vertical.
  countanswers: number; // Number of submitted answers.
  checked: boolean; // Whether current user selected this option.
  disabled: boolean; // Whether option is currently disabled.
};

/**
 * Params of mod_choice_get_choice_results WS.
 */
export type AddonModChoiceGetChoiceResultsWSParams = {
  choiceid: number; // Choice instance id.
  groupid?: number; // Group ID. 0 for all participants.
};

/**
 * Data returned by mod_choice_get_choice_results WS.
 */
export type AddonModChoiceGetChoiceResultsWSResponse = {
  options: AddonModChoiceResult[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Choice result returned by mod_choice_get_choice_results WS.
 */
export type AddonModChoiceResult = {
  id: number; // Option id.
  text: string; // Option text.
  maxanswer: number; // Maximum number of answers.
  userresponses: {
    userid: number; // User id.
    fullname: string; // User full name.
    profileimageurl: string; // User profile image URL.
    answerid?: number; // Answer id.
    timemodified?: number; // Modification timestamp.
  }[];
  numberofuser: number; // Number of users that selected this option.
  percentageamount: number; // Percentage of users that selected this option.
};

/**
 * Params of mod_choice_submit_choice_response WS.
 */
export type AddonModChoiceSubmitChoiceResponseWSParams = {
  choiceid: number; // Choice instance id.
  responses: number[]; // Selected option ids.
};

/**
 * Data returned by mod_choice_submit_choice_response WS.
 */
export type AddonModChoiceSubmitChoiceResponseWSResponse = {
  warnings?: CoreWSExternalWarning[];
};

/**
 * Params of mod_choice_delete_choice_responses WS.
 */
export type AddonModChoiceDeleteChoiceResponsesWSParams = {
  choiceid: number; // Choice instance id.
  responses?: number[]; // Optional response ids, empty to delete all current user responses.
};

/**
 * Data returned by mod_choice_delete_choice_responses WS.
 */
export type AddonModChoiceDeleteChoiceResponsesWSResponse = {
  status: boolean; // Operation status.
  warnings?: CoreWSExternalWarning[];
};
