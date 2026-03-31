import AsyncStorage from "@react-native-async-storage/async-storage";
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto/build/Crypto";

const PENDING_SSO_KEY = "moodle.pending-sso";
const OFFICIAL_SCHEMES = ["moodlemobile://", "mobile://"];

export type ParsedMoodleLink =
  | {
      kind: "qr";
      siteUrl: string;
      qrLoginKey: string;
      userId: string;
    }
  | {
      kind: "sso-token";
      encodedPayload: string;
    }
  | {
      kind: "site";
      siteUrl: string;
      username?: string;
      token?: string;
      privateToken?: string;
      redirectUrl?: string;
      isAuthenticationUrl: boolean;
    };

type PendingSSOLogin = {
  siteUrl: string;
  passport: string;
  redirectUrl?: string;
};

export type ResolvedSSOToken = {
  siteUrl: string;
  token: string;
  privateToken?: string;
  redirectUrl?: string;
};

export function isOfficialMoodleScheme(url: string) {
  return OFFICIAL_SCHEMES.some((scheme) => url.startsWith(scheme));
}

export function parseIncomingMoodleLink(rawUrl: string): ParsedMoodleLink | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return parseSiteLink(trimmed);
  }

  const matchingScheme = OFFICIAL_SCHEMES.find((scheme) => trimmed.startsWith(scheme));
  if (!matchingScheme) {
    return null;
  }

  let withoutScheme = trimmed.slice(matchingScheme.length);
  if (withoutScheme.startsWith("token=")) {
    return {
      kind: "sso-token",
      encodedPayload: withoutScheme.slice("token=".length).replace(/\/?#?\/?$/, ""),
    };
  }

  if (withoutScheme.startsWith("link=")) {
    withoutScheme = normalizeInnerLink(withoutScheme.slice("link=".length));
    return parseSiteLink(withoutScheme);
  }

  withoutScheme = normalizeInnerLink(withoutScheme);
  if (!/^https?:\/\//i.test(withoutScheme)) {
    withoutScheme = `https://${withoutScheme}`;
  }

  return parseSiteLink(withoutScheme);
}

export function resolveInAppRoute(rawUrl: string) {
  const trimmed = rawUrl.trim();
  const matchingScheme = OFFICIAL_SCHEMES.find((scheme) => trimmed.startsWith(scheme));
  if (!matchingScheme) {
    return null;
  }

  const withoutScheme = normalizeInnerLink(trimmed.slice(matchingScheme.length));
  if (
    withoutScheme.startsWith("token=") ||
    withoutScheme.startsWith("link=") ||
    /^https?:\/\//i.test(withoutScheme) ||
    looksLikeExternalHost(withoutScheme)
  ) {
    return null;
  }

  const route = withoutScheme.startsWith("/") ? withoutScheme : `/${withoutScheme}`;
  if (route === "/") {
    return null;
  }

  return route;
}

function looksLikeExternalHost(value: string) {
  const firstSegment = value.split(/[/?#]/, 1)[0] ?? "";
  return firstSegment.includes(".") || firstSegment.includes(":");
}

export async function savePendingSSOLogin(input: PendingSSOLogin) {
  await AsyncStorage.setItem(PENDING_SSO_KEY, JSON.stringify(input));
}

export async function clearPendingSSOLogin() {
  await AsyncStorage.removeItem(PENDING_SSO_KEY);
}

export async function prepareBrowserSSOLogin(input: {
  siteUrl: string;
  service?: string;
  launchUrl?: string;
  redirectUrl?: string;
  scheme?: string;
}) {
  const siteUrl = normalizeSiteUrl(input.siteUrl);
  const passport = randomUUID();
  const url = new URL(input.launchUrl || `${siteUrl}/admin/tool/mobile/launch.php`);
  url.searchParams.set("service", input.service || "moodle_mobile_app");
  url.searchParams.set("passport", passport);
  url.searchParams.set("urlscheme", input.scheme || "moodlemobile");

  await savePendingSSOLogin({
    siteUrl,
    passport,
    redirectUrl: input.redirectUrl,
  });

  return url.toString();
}

export async function resolvePendingSSOToken(encodedPayload: string): Promise<ResolvedSSOToken> {
  const pending = await readPendingSSOLogin();
  if (!pending) {
    throw new Error("Missing pending SSO login state.");
  }

  const decoded = decodeBase64(encodedPayload);
  const [signature = "", token = "", privateToken = ""] = decoded.split(":::");
  if (!token) {
    throw new Error("Invalid SSO callback payload.");
  }

  const expected = await digestStringAsync(
    CryptoDigestAlgorithm.MD5,
    `${pending.siteUrl}${pending.passport}`,
  );

  if (signature && signature !== expected) {
    const alternateUrl = pending.siteUrl.startsWith("https://")
      ? pending.siteUrl.replace(/^https:\/\//i, "http://")
      : pending.siteUrl.replace(/^http:\/\//i, "https://");
    const alternate = await digestStringAsync(
      CryptoDigestAlgorithm.MD5,
      `${alternateUrl}${pending.passport}`,
    );

    if (signature !== alternate) {
      throw new Error("Invalid SSO callback signature.");
    }
  }

  await clearPendingSSOLogin();

  return {
    siteUrl: pending.siteUrl,
    token,
    privateToken: privateToken || undefined,
    redirectUrl: pending.redirectUrl,
  };
}

export function normalizeSiteUrl(value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  return `https://${trimmed.replace(/\/$/, "")}`;
}

export function buildAuthenticatedDestinationUrl(input: {
  siteUrl: string;
  redirectUrl?: string;
}) {
  if (!input.redirectUrl) {
    return normalizeSiteUrl(input.siteUrl);
  }

  if (/^https?:\/\//i.test(input.redirectUrl)) {
    return input.redirectUrl;
  }

  return new URL(input.redirectUrl, `${normalizeSiteUrl(input.siteUrl)}/`).toString();
}

function parseSiteLink(url: string): ParsedMoodleLink {
  const parsed = new URL(url);
  const siteUrl = parsed.origin;
  const params = getCombinedParams(parsed);
  const qrLoginKey = params.get("qrlogin");
  const userId = params.get("userid");
  if (qrLoginKey && userId) {
    return {
      kind: "qr",
      siteUrl,
      qrLoginKey,
      userId,
    };
  }

  const token = params.get("token") ?? undefined;
  const privateToken = params.get("privatetoken") ?? undefined;
  const redirectUrl = params.get("redirect") ?? inferRedirectUrl(parsed, params);
  const username = parsed.username || undefined;

  return {
    kind: "site",
    siteUrl,
    username,
    token,
    privateToken,
    redirectUrl,
    isAuthenticationUrl: Boolean(token),
  };
}

function inferRedirectUrl(parsed: URL, params: URLSearchParams) {
  if (parsed.pathname === "/" && !parsed.search && !parsed.hash) {
    return undefined;
  }

  const next = new URL(parsed.toString());
  next.username = "";
  next.password = "";
  for (const key of ["token", "privatetoken", "qrlogin", "userid"]) {
    next.searchParams.delete(key);
  }

  const hashParams = new URLSearchParams(next.hash.startsWith("#") ? next.hash.slice(1) : next.hash);
  for (const [key] of hashParams) {
    if (!params.has(key)) {
      continue;
    }
    if (["token", "privatetoken", "qrlogin", "userid"].includes(key)) {
      hashParams.delete(key);
    }
  }

  const nextHash = hashParams.toString();
  next.hash = nextHash ? `#${nextHash}` : "";
  const normalized = next.toString();

  return normalized === parsed.origin || normalized === `${parsed.origin}/` ? undefined : normalized;
}

function normalizeInnerLink(value: string) {
  return value
    .replace(/^https\/\//i, "https://")
    .replace(/^http\/\//i, "http://")
    .replace(/^\/\//, "https://");
}

function getCombinedParams(url: URL) {
  const params = new URLSearchParams(url.search);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);

  for (const [key, value] of hashParams.entries()) {
    if (!params.has(key)) {
      params.set(key, value);
    }
  }

  return params;
}

function decodeBase64(value: string) {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }

  throw new Error("No base64 decoder available.");
}

async function readPendingSSOLogin(): Promise<PendingSSOLogin | null> {
  const stored = await AsyncStorage.getItem(PENDING_SSO_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as PendingSSOLogin;
  } catch {
    await clearPendingSSOLogin();
    return null;
  }
}
