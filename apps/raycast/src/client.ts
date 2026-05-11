import {
  AuthError,
  authenticateWithCredentials,
  authenticateWithQrLogin,
  type MoodleSession,
} from "@moodle/core";
import { Cache, LocalStorage } from "@raycast/api";

import {
  isQrAuth,
  preferences,
  siteOrigin,
  siteUrl,
} from "./helpers/preferences";

export interface User extends MoodleSession {
  id: number;
  username?: string;
  fullname?: string;
}

const cache = new Cache({ namespace: "user" });
let user: User | null = null;
let userPromise: Promise<User> | null = null;

async function authenticate(): Promise<User> {
  if (isQrAuth) {
    const session = await authenticateWithQrLogin({
      siteOrigin,
      qrLoginKey: siteUrl.searchParams.get("qrlogin") ?? "",
      userId: siteUrl.searchParams.get("userid") ?? "",
    });
    return mapSessionToUser(session);
  }

  if (!preferences.username || !preferences.password) {
    throw new AuthError("Missing username or password in preferences", {
      code: "missing_credentials",
    });
  }

  const session = await authenticateWithCredentials({
    siteOrigin,
    username: preferences.username,
    password: preferences.password,
  });
  return mapSessionToUser(session);
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

async function loadUser(): Promise<User> {
  const cached = cache.get("userData");
  if (cached) {
    try {
      user = JSON.parse(cached) as User;
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

const suspended = createSuspense(ensureUserPromise());

export function useUser(): User {
  return suspended.read();
}

export function getUser(): Promise<User> {
  return ensureUserPromise();
}

export function getUserSync(): User | null {
  return user;
}

export async function refreshUserTokens(): Promise<User> {
  const refreshed = await authenticate();
  saveUser(refreshed);
  return refreshed;
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
