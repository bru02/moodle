import { Cache, LocalStorage } from "@raycast/api";
import { AuthError } from "./errors";
import { getUrlForService } from "./helpers";
import { getMoodleErrorCode, getMoodleErrorMessage } from "./helpers/moodle-errors";
import { isQrAuth, preferences, siteOrigin, siteUrl } from "./helpers/preferences";

interface User {
  token: string;
  privateToken?: string;
  accessKey: string;
  id: number;
}

const cache = new Cache({ namespace: "user" });
let user: User | null = null;
let userPromise: Promise<User> | null = null;

type TokenResponse = { token?: string; privatetoken?: string };

async function login(): Promise<{ token: string; privatetoken?: string }> {
  if (isQrAuth) {
    const resp = await fetch(
      `${siteOrigin}/lib/ajax/service-nologin.php?info=tool_mobile_get_tokens_for_qr_login&lang=en`,
      {
        method: "POST",
        body: JSON.stringify([{
          index: 0,
          methodname: "tool_mobile_get_tokens_for_qr_login",
          args: { qrloginkey: siteUrl.searchParams.get("qrlogin"), userid: siteUrl.searchParams.get("userid") },
        }]),
        headers: { "Content-Type": "application/json", "User-Agent": "MoodleMobile" },
      },
    );
    const json = await resp.json() as TokenResponse | { data?: TokenResponse }[];
    const data = Array.isArray(json) ? json[0]?.data : json;
    if (!data?.token) throw new AuthError(getMoodleErrorMessage(data) ?? "QR login failed", { code: getMoodleErrorCode(data) });
    return { token: data.token, privatetoken: data.privatetoken };
  }

  if (!preferences.username || !preferences.password) {
    throw new AuthError("Missing username or password in preferences", { code: "missing_credentials" });
  }

  const resp = await fetch(`${siteOrigin}/login/token.php?lang=en`, {
    method: "POST",
    body: new URLSearchParams({ username: preferences.username, password: preferences.password, service: "moodle_mobile_app" }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const data = await resp.json() as TokenResponse;
  if (!data?.token) throw new AuthError(getMoodleErrorMessage(data) ?? "Login failed", { code: getMoodleErrorCode(data) });
  return { token: data.token, privatetoken: data.privatetoken };
}

type SiteInfoResponse = { userid?: number; userprivateaccesskey?: string; message?: string };

async function fetchSiteInfo(token: string): Promise<SiteInfoResponse> {
  const resp = await fetch(getUrlForService("core_webservice_get_site_info", token));
  const json = await resp.json() as SiteInfoResponse;
  if (json.message) throw new AuthError(json.message, { code: "site_info_failed" });
  return json;
}

async function authenticate(): Promise<User> {
  const { token, privatetoken } = await login();
  const siteInfo = await fetchSiteInfo(token);
  return {
    token,
    privateToken: privatetoken,
    id: siteInfo.userid ?? 0,
    accessKey: siteInfo.userprivateaccesskey ?? "",
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
    try { user = JSON.parse(cached); } catch { /* ignore */ }
  }

  const stored = await LocalStorage.getItem<string>("userData");
  if (stored) {
    try { user = JSON.parse(stored); } catch { /* ignore */ }
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
    (r) => { status = "success"; result = r; },
    (e) => { status = "error"; result = e; },
  );
  return {
    read() {
      if (status === "pending") throw suspender;
      if (status === "error") throw result;
      return result;
    },
  };
}
