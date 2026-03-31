export type AuthMethod = "credentials" | "qr";

export type MoodleSession = {
  token: string;
  privateToken?: string;
  accessKey: string;
  userId: number;
  username?: string;
  fullname?: string;
  authenticatedAt: number;
  refreshedAt: number;
};

export type StoredAccount = {
  id: string;
  siteUrl: string;
  origin: string;
  label: string;
  authMethod: AuthMethod;
  username?: string;
  fullname?: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
};

export type MoodleAccount = StoredAccount & {
  avatarUrl?: string;
  session?: MoodleSession;
};

export type AppSettings = {
  mergeSimilarCourses: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  mergeSimilarCourses: true,
};
