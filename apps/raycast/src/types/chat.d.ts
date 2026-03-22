import { CoreCourseModuleStandardElements, CoreWSExternalWarning } from ".";

/**
 * Params of mod_chat_get_chats_by_courses WS.
 */
export type AddonModChatGetChatsByCoursesWSParams = {
  courseids?: number[]; // Array of course ids.
};

/**
 * Data returned by mod_chat_get_chats_by_courses WS.
 */
export type AddonModChatGetChatsByCoursesWSResponse = {
  chats: AddonModChatChat[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Chat data returned by mod_chat_get_chats_by_courses WS.
 */
export type AddonModChatChat = CoreCourseModuleStandardElements & {
  chatmethod?: string; // Chat method.
  keepdays?: number; // Number of days to keep messages.
  studentlogs?: number; // Whether students can view logs.
  chattime?: number; // Scheduled chat time in seconds since epoch.
  schedule?: number; // Schedule mode.
  timemodified?: number; // Last modified time.
};

/**
 * Params of mod_chat_login_user WS.
 */
export type AddonModChatLoginUserWSParams = {
  chatid: number; // Chat instance id.
  groupid?: number; // Group id (0 for current user groups).
};

/**
 * Data returned by mod_chat_login_user WS.
 */
export type AddonModChatLoginUserWSResponse = {
  chatsid: string; // Active chat session id.
  warnings?: CoreWSExternalWarning[];
};

/**
 * Params of mod_chat_get_chat_latest_messages WS.
 */
export type AddonModChatGetChatLatestMessagesWSParams = {
  chatsid: string; // Active chat session id.
  chatlasttime?: number; // Last retrieved message timestamp.
};

/**
 * Data returned by mod_chat_get_chat_latest_messages WS.
 */
export type AddonModChatGetChatLatestMessagesWSResponse = {
  messages: AddonModChatWSMessage[];
  chatnewlasttime: number; // New last timestamp.
  warnings?: CoreWSExternalWarning[];
};

/**
 * Chat message returned by chat WS.
 */
export type AddonModChatWSMessage = {
  id: number; // Message id.
  userid: number; // Message author id.
  system: boolean; // Whether this is a system message.
  message: string; // Message content.
  timestamp: number; // Message time.
};

/**
 * Params of mod_chat_send_chat_message WS.
 */
export type AddonModChatSendChatMessageWSParams = {
  chatsid: string; // Active chat session id.
  messagetext: string; // Message text.
  beepid?: string; // Optional user id to beep.
};

/**
 * Data returned by mod_chat_send_chat_message WS.
 */
export type AddonModChatSendChatMessageWSResponse = {
  messageid: number; // Message id.
  warnings?: CoreWSExternalWarning[];
};

/**
 * Params of mod_chat_get_sessions WS.
 */
export type AddonModChatGetSessionsWSParams = {
  chatid: number; // Chat instance id.
  groupid?: number; // Group id (0 for current user groups).
  showall?: boolean; // Whether to include all sessions.
};

/**
 * Data returned by mod_chat_get_sessions WS.
 */
export type AddonModChatGetSessionsWSResponse = {
  sessions: AddonModChatSession[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Session data returned by mod_chat_get_sessions WS.
 */
export type AddonModChatSession = {
  sessionstart: number; // Session start timestamp.
  sessionend: number; // Session end timestamp.
  iscomplete: boolean; // Whether session is complete.
  sessionusers: AddonModChatSessionUser[];
};

/**
 * Session user data.
 */
export type AddonModChatSessionUser = {
  userid: number; // User id.
  messagecount: number; // Number of messages sent in session.
};

/**
 * Params of mod_chat_get_session_messages WS.
 */
export type AddonModChatGetSessionMessagesWSParams = {
  chatid: number; // Chat instance id.
  sessionstart: number; // Session start timestamp.
  sessionend: number; // Session end timestamp.
  groupid?: number; // Group id (0 for current user groups).
};

/**
 * Data returned by mod_chat_get_session_messages WS.
 */
export type AddonModChatGetSessionMessagesWSResponse = {
  messages: AddonModChatWSSessionMessage[];
  warnings?: CoreWSExternalWarning[];
};

/**
 * Session message returned by mod_chat_get_session_messages WS.
 */
export type AddonModChatWSSessionMessage = {
  id: number; // Message id.
  chatid: number; // Chat instance id.
  userid: number; // User id.
  groupid: number; // Group id.
  message: string; // Message text.
  timestamp: number; // Message timestamp.
  issystem: boolean; // Whether this is a system message.
  system?: boolean; // Alternate system flag.
  userfullname?: string; // Optional author full name.
};
