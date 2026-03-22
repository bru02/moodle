/**
 * Data returned by core_comment_get_comments WS.
 */
export type CoreCommentsGetCommentsWSResponse = {
  comments: CoreCommentsData[]; // List of comments.
  count?: number; // @since 3.8. Total number of comments.
  perpage?: number; // @since 3.8. Number of comments per page.
  canpost?: boolean; // Whether the user can post in this comment area.
  warnings?: CoreWSExternalWarning[];
};

/**
 * Comments Data returned by WS.
 */
export type CoreCommentsData = {
  id: number; // Comment ID.
  content: string; // The content text formatted.
  format: CoreTextFormat; // Content format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
  timecreated: number; // Time created (timestamp).
  strftimeformat: string; // Time format.
  profileurl: string; // URL profile.
  fullname: string; // Fullname.
  time: string; // Time in human format.
  avatar: string; // HTML user picture.
  userid: number; // User ID.
  delete?: boolean; // Permission to delete=true/false.
};

/**
 * Params of core_comment_get_comments WS.
 */
export type CoreCommentsGetCommentsWSParams = {
  contextlevel: ContextLevel; // Contextlevel system, course, user...
  instanceid: number; // The Instance id of item associated with the context level.
  component: string; // Component.
  itemid: number; // Associated id.
  area?: string; // String comment area.
  page?: number; // Page number (0 based).
  sortdirection?: string; // Sort direction: ASC or DESC.
};

/**
 * Context levels enumeration.
 */
export const ContextLevel = {
  SYSTEM: "system",
  USER: "user",
  COURSECAT: "coursecat",
  COURSE: "course",
  MODULE: "module",
  BLOCK: "block",
} as const;

export type ContextLevel = (typeof ContextLevel)[keyof typeof ContextLevel];
