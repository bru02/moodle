import {
  authenticateWithCredentials,
  isAuthError,
  type MoodleSession,
} from "@moodle/core";
import { Cache, LocalStorage } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";

import { requestCredentialsLogin } from "./credentials-login-request";
import { siteOrigin } from "./helpers/preferences";
import { authenticateWithMoodleOAuth } from "./oauth-auth";

export interface User extends MoodleSession {
  id: number;
  username?: string;
  fullname?: string;
}

const cache = new Cache({ namespace: "user" });
let user: User | null = null;
let userPromise: Promise<User> | null = null;
const CREDENTIALS_KEY = "moodleCredentials";

type StoredCredentials = {
  username: string;
  password: string;
};

async function authenticate(): Promise<User> {
  const credentials = await getStoredCredentials();
  if (credentials) {
    let session: MoodleSession;
    try {
      session = await authenticateWithCredentials({
        siteOrigin,
        username: credentials.username,
        password: credentials.password,
      });
    } catch (error) {
      if (!isAuthError(error)) {
        throw error;
      }

      await showFailureToast(error, { title: "Authentication failed" });
      session = await requestFreshCredentialsLogin();
    }

    return mapSessionToUser(session);
  }

  const result = await authenticateWithMoodleOAuth(siteOrigin);
  return mapSessionToUser(result.session);
}

function mapSessionToUser(session: MoodleSession): User {
  return {
    ...session,
    id: session.account.userId,
    username: session.account.username,
    fullname: session.account.fullname,
  };
}

function saveUser(u: User) {
  user = u;
  const json = JSON.stringify(u);
  cache.set("userData", json);
  LocalStorage.setItem("userData", json);
}

export function saveSession(session: MoodleSession) {
  const nextUser = mapSessionToUser(session);
  saveUser(nextUser);
  userPromise = Promise.resolve(nextUser);
  suspended = createSuspense(ensureUserPromise());
}

async function loadUser(): Promise<User> {
  const cached = cache.get("userData");
  if (cached) {
    try {
      user = JSON.parse(cached) as User;
      return user;
    } catch {
      /* ignore */
    }
  }

  const stored = await LocalStorage.getItem<string>("userData");
  if (stored) {
    try {
      user = JSON.parse(stored) as User;
    } catch {
      /* ignore */
    }
  }

  if (!user) {
    user = await authenticate();
    saveUser(user);
  }

  return user;
}

function ensureUserPromise(): Promise<User> {
  if (!userPromise) userPromise = loadUser();
  return userPromise;
}

let suspended: ReturnType<typeof createSuspense<User>> | null = null;

export function useUser(): User {
  if (!suspended) suspended = createSuspense(ensureUserPromise());
  return suspended.read();
}

export function getUser(): Promise<User> {
  return ensureUserPromise();
}

export function getUserSync(): User | null {
  return user;
}

export function resetUserState() {
  user = null;
  userPromise = null;
  cache.remove("userData");
  void LocalStorage.removeItem("userData");
  suspended = null;
}

export function replaceUserToken(token: string) {
  if (!user) return;
  saveUser({ ...user, token });
  userPromise = Promise.resolve(user);
  suspended = createSuspense(ensureUserPromise());
}

export async function refreshUserTokens(): Promise<User> {
  const credentials = await getStoredCredentials();
  if (!credentials) {
    resetUserState();
    const session = await requestCredentialsLogin();
    const refreshed = mapSessionToUser(session);
    saveUser(refreshed);
    return refreshed;
  }

  try {
    const refreshed = mapSessionToUser(
      await authenticateWithCredentials({
        siteOrigin,
        username: credentials.username,
        password: credentials.password,
      }),
    );
    saveUser(refreshed);
    return refreshed;
  } catch (error) {
    if (!isAuthError(error)) {
      throw error;
    }

    await showFailureToast(error, { title: "Authentication failed" });
    const session = await requestFreshCredentialsLogin();
    const refreshed = mapSessionToUser(session);
    saveUser(refreshed);
    return refreshed;
  }
}

export async function getStoredCredentials(): Promise<StoredCredentials | null> {
  const stored = await LocalStorage.getItem<string>(CREDENTIALS_KEY);
  if (!stored) return null;

  try {
    const credentials = JSON.parse(stored) as Partial<StoredCredentials>;
    if (credentials.username && credentials.password) {
      return {
        username: credentials.username,
        password: credentials.password,
      };
    }
  } catch {
    /* ignore */
  }

  return null;
}

export async function saveStoredCredentials(
  credentials: StoredCredentials,
  session?: MoodleSession,
) {
  await LocalStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  if (!session) {
    resetUserState();
    return;
  }

  userPromise = null;
  cache.remove("userData");
  void LocalStorage.removeItem("userData");
  saveSession(session);
}

export async function clearStoredCredentials() {
  await LocalStorage.removeItem(CREDENTIALS_KEY);
  resetUserState();
}

async function requestFreshCredentialsLogin(): Promise<MoodleSession> {
  await clearStoredCredentials();
  return await requestCredentialsLogin();
}

function createSuspense<T>(promise: Promise<T>): { read(): T } {
  let status: "pending" | "success" | "error" = "pending";
  let result: T;
  const suspender = promise.then(
    (r) => {
      status = "success";
      result = r;
    },
    (e) => {
      status = "error";
      result = e;
    },
  );
  return {
    read() {
      if (status === "pending") throw suspender;
      if (status === "error") throw result;
      return result;
    },
  };
}
