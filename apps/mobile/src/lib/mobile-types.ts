import type { MoodleSession, MoodleSiteInfo, StoredAccount } from "@moodle/core";

export type AppSettings = {
  mergeSimilarCourses: boolean;
};

export type PasswordAuthSecret = {
  kind: "password";
  username: string;
  password: string;
};

export type QrAuthSecret = {
  kind: "qr";
  qrLoginKey: string;
  userId: string;
};

export type TokenAuthSecret = {
  kind: "token";
};

export type StoredAuthSecret = PasswordAuthSecret | QrAuthSecret | TokenAuthSecret;

export type StoredSecureSession = {
  token: string;
  privateToken?: string;
  accessKey: string;
  authenticatedAt: number;
  siteInfo: MoodleSiteInfo;
  auth: StoredAuthSecret;
};

export type SessionContextValue = {
  isHydrated: boolean;
  draftSiteOrigin: string;
  setDraftSiteOrigin: (value: string) => void;
  settings: AppSettings;
  setMergeSimilarCourses: (value: boolean) => Promise<void>;
  accounts: StoredAccount[];
  activeAccount: StoredAccount | null;
  activeSession: MoodleSession | null;
  resolveSite: (input: { siteUrl: string }) => Promise<{
    siteUrl: string;
    siteName?: string;
    launchUrl?: string;
    loginType: number;
    showLoginForm: boolean;
  }>;
  signInWithCredentials: (input: { siteOrigin: string; username: string; password: string }) => Promise<MoodleSession>;
  signInWithToken: (input: { siteOrigin: string; token: string; privateToken?: string }) => Promise<MoodleSession>;
  signInWithQrPayload: (payload: string) => Promise<MoodleSession>;
  switchAccount: (accountId: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  refreshSessionForAccount: (accountId: string) => Promise<MoodleSession>;
  clearCaches: () => Promise<void>;
};

export type SpotlightCourseRecord = {
  id: string;
  courseId: string;
  title: string;
  subtitle: string;
  deeplink: string;
  keywords?: string;
  updatedAt?: number;
  lastUsedAt?: number;
};
