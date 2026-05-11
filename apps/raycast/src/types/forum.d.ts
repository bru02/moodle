import {
  CoreRatingInfo,
  CoreTextFormat,
  CoreWSExternalFile,
  CoreWSExternalWarning,
  CoreWSStoredFile,
} from ".";

/**
 * Params of mod_forum_get_forums_by_courses WS.
 */
export type AddonModForumGetForumsByCoursesWSParams = {
  courseids?: number[]; // Array of Course IDs.
};

/**
 * General forum activity data.
 */
export type AddonModForumData = {
  id: number; // Forum id.
  course: number; // Course id.
  type: AddonModForumType; // The forum type.
  name: string; // Forum name.
  intro: string; // The forum intro.
  introformat: CoreTextFormat; // Intro format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
  introfiles?: CoreWSExternalFile[];
  duedate?: number; // Duedate for the user.
  cutoffdate?: number; // Cutoffdate for the user.
  assessed: number; // Aggregate type.
  assesstimestart: number; // Assess start time.
  assesstimefinish: number; // Assess finish time.
  scale: number; // Scale.

  grade_forum: number; // Whole forum grade.

  grade_forum_notify: number; // Whether to send notifications to students upon grading by default.
  maxbytes: number; // Maximum attachment size.
  maxattachments: number; // Maximum number of attachments.
  forcesubscribe: number; // Force users to subscribe.
  trackingtype: number; // Subscription mode.
  rsstype: number; // RSS feed for this activity.
  rssarticles: number; // Number of RSS recent articles.
  timemodified: number; // Time modified.
  warnafter: number; // Post threshold for warning.
  blockafter: number; // Post threshold for blocking.
  blockperiod: number; // Time period for blocking.
  completiondiscussions: number; // Student must create discussions.
  completionreplies: number; // Student must post replies.
  completionposts: number; // Student must post discussions or replies.
  cmid: number; // Course module id.
  numdiscussions?: number; // Number of discussions in the forum.
  cancreatediscussions?: boolean; // If the user can create discussions.
  lockdiscussionafter?: number; // After what period a discussion is locked.
  istracked?: boolean; // If the user is tracking the forum.
  unreadpostscount?: number; // The number of unread posts for tracked forums.
};

/**
 * Data returned by mod_forum_get_forums_by_courses WS.
 */
export type AddonModForumGetForumsByCoursesWSResponse = AddonModForumData[];

/**
 * Params of mod_forum_get_forum_discussions WS.
 */
export type AddonModForumGetForumDiscussionsWSParams = {
  forumid: number; // Forum instance id.
  sortorder?: number; // Sort by this element: numreplies, , created or timemodified.
  page?: number; // Current page.
  perpage?: number; // Items per page.
  groupid?: number; // Group id.
};

/**
 * Data returned by mod_forum_get_forum_discussions WS.
 */
export type AddonModForumGetForumDiscussionsWSResponse = {
  discussions: AddonModForumDiscussion[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Forum discussion.
 */
export type AddonModForumDiscussion = {
  id: number; // Post id.
  name: string; // Discussion name.
  groupid: number; // Group id.
  groupname?: string; // Group name (not returned by WS).
  timemodified: number; // Time modified.
  usermodified: number; // The id of the user who last modified.
  timestart: number; // Time discussion can start.
  timeend: number; // Time discussion ends.
  discussion: number; // Discussion id.
  parent: number; // Parent id.
  userid: number; // User who started the discussion id.
  created: number; // Creation time.
  modified: number; // Time modified.
  mailed: number; // Mailed?.
  subject: string; // The post subject.
  message: string; // The post message.
  messageformat: CoreTextFormat; // Message format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
  messagetrust: number; // Can we trust?.
  messageinlinefiles?: CoreWSExternalFile[];
  attachment: string; // Has attachments?.
  attachments?: CoreWSExternalFile[];
  totalscore: number; // The post message total score.
  mailnow: number; // Mail now?.
  userfullname: string | boolean; // Post author full name.
  usermodifiedfullname: string; // Post modifier full name.
  userpictureurl?: string; // Post author picture.
  usermodifiedpictureurl: string; // Post modifier picture.
  numreplies: number; // The number of replies in the discussion.
  numunread: number; // The number of unread discussions.
  pinned: boolean; // Is the discussion pinned.
  locked: boolean; // Is the discussion locked.
  starred?: boolean; // Is the discussion starred.
  canreply: boolean; // Can the user reply to the discussion.
  canlock: boolean; // Can the user lock the discussion.
  canfavourite?: boolean; // Can the user star the discussion.
};

/**
 * Params of mod_forum_get_discussion_posts WS.
 */
export type AddonModForumGetDiscussionPostsWSParams = {
  discussionid: number; // The ID of the discussion from which to fetch posts.
  sortby?: string; // Sort by this element: id, created or modified.
  sortdirection?: string; // Sort direction: ASC or DESC.
  includeinlineattachments?: boolean; // @since 4.0. Whether inline attachments should be included or not.
};

/**
 * Data returned by mod_forum_get_discussion_posts WS.
 */
export type AddonModForumGetDiscussionPostsWSResponse = {
  posts: AddonModForumWSPost[];
  forumid: number; // The forum id.
  courseid: number; // The forum course id.
  ratinginfo?: CoreRatingInfo; // Rating information.
  warnings?: CoreWSExternalWarning[];
};

/**
 * Forum post data returned by web services.
 */
export type AddonModForumWSPost = {
  id: number; // Id.
  subject: string; // Subject.
  replysubject: string; // Replysubject.
  message: string; // Message.
  messageformat: CoreTextFormat; // Message format (1 = HTML, 0 = MOODLE, 2 = PLAIN or 4 = MARKDOWN).
  author: {
    id?: number; // Id.
    fullname?: string; // Fullname.
    isdeleted?: boolean; // Isdeleted.
    groups?: {
      // Groups.
      id: number; // Id.
      name: string; // Name.
      urls: {
        image?: string; // Image.
      };
    }[];
    urls: {
      profile?: string; // The URL for the use profile page.
      profileimage?: string; // The URL for the use profile image.
    };
  };
  discussionid: number; // Discussionid.
  hasparent: boolean; // Hasparent.
  parentid?: number; // Parentid.
  timecreated: number; // Timecreated.
  unread?: boolean; // Unread.
  isdeleted: boolean; // Isdeleted.
  isprivatereply: boolean; // Isprivatereply.
  haswordcount: boolean; // Haswordcount.
  wordcount?: number; // Wordcount.
  charcount?: number; // Charcount.
  capabilities: {
    view: boolean; // Whether the user can view the post.
    edit: boolean; // Whether the user can edit the post.
    delete: boolean; // Whether the user can delete the post.
    split: boolean; // Whether the user can split the post.
    reply: boolean; // Whether the user can reply to the post.
    selfenrol: boolean; // Whether the user can self enrol into the course.
    export: boolean; // Whether the user can export the post.
    controlreadstatus: boolean; // Whether the user can control the read status of the post.
    canreplyprivately: boolean; // Whether the user can post a private reply.
  };
  urls?: {
    view?: string; // The URL used to view the post.
    viewisolated?: string; // The URL used to view the post in isolation.
    viewparent?: string; // The URL used to view the parent of the post.
    edit?: string; // The URL used to edit the post.
    delete?: string; // The URL used to delete the post.

    // The URL used to split the discussion with the selected post being the first post in the new discussion.
    split?: string;

    reply?: string; // The URL used to reply to the post.
    export?: string; // The URL used to export the post.
    markasread?: string; // The URL used to mark the post as read.
    markasunread?: string; // The URL used to mark the post as unread.
    discuss?: string; // Discuss.
  };
  attachments: CoreWSStoredFile[]; // Attachments.
  tags?: {
    // Tags.
    id: number; // The ID of the Tag.
    tagid: number; // The tagid.
    isstandard: boolean; // Whether this is a standard tag.
    displayname: string; // The display name of the tag.
    flag: boolean; // Wehther this tag is flagged.
    urls: {
      view: string; // The URL to view the tag.
    };
  }[];
  html?: {
    rating?: string; // The HTML source to rate the post.
    taglist?: string; // The HTML source to view the list of tags.
    authorsubheading?: string; // The HTML source to view the author details.
  };
};

export const AddonModForumType = {
  NEWS: "news",
  SOCIAL: "social",
  GENERAL: "general",
  EACHUSER: "eachuser",
  SINGLE: "single",
  QANDA: "qanda",
  BLOG: "blog",
} as const;

export type AddonModForumType =
  (typeof AddonModForumType)[keyof typeof AddonModForumType];
