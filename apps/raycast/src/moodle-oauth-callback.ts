import { createHash } from "node:crypto";

import { AuthError } from "@moodle/core";

type Handoff = {
  siteOrigin: string;
  passport: string;
};

export function parseMoodleMobileCallback(
  callbackURL: string,
  handoff: Handoff,
) {
  const direct = parseDirectTokenCallback(callbackURL);
  if (direct) return direct;

  const deprecated = parseDeprecatedTokenCallback(callbackURL);
  if (deprecated) return validateBrowserTokenPayload(deprecated, handoff);

  return validateBrowserTokenPayload(
    splitBrowserTokenPayload(callbackURL),
    handoff,
  );
}

export function buildMoodleLaunchURL(
  siteOrigin: string,
  passport: string,
  launchURL?: string,
) {
  const url = launchURL
    ? new URL(launchURL, normalizeSiteOrigin(siteOrigin))
    : new URL("/admin/tool/mobile/launch.php", normalizeSiteOrigin(siteOrigin));
  url.searchParams.set("service", "moodle_mobile_app");
  url.searchParams.set("passport", passport);
  url.searchParams.set("urlscheme", "moodlemobile");
  url.hash = "raycast";
  return url.toString();
}

function parseDirectTokenCallback(callbackURL: string) {
  let parsed: URL;
  try {
    parsed = new URL(callbackURL);
  } catch {
    return null;
  }

  const token = parsed.searchParams.get("token");
  if (!token) return null;

  const privateToken =
    parsed.searchParams.get("privatetoken") ??
    parsed.searchParams.get("privateToken") ??
    undefined;

  return {
    siteOrigin: siteOriginFromDirectCallback(parsed),
    token,
    privateToken,
  };
}

function parseDeprecatedTokenCallback(callbackURL: string) {
  const prefix = "moodlemobile://token=";
  if (!callbackURL.startsWith(prefix)) return null;

  const encoded = decodeURIComponent(callbackURL.slice(prefix.length)).replace(
    /[/#]+$/g,
    "",
  );
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  if (!decoded) {
    throw new AuthError("Moodle token callback was not valid base64", {
      code: "invalid_oauth_callback",
    });
  }
  return splitBrowserTokenPayload(decoded);
}

function validateBrowserTokenPayload(tokenParts: string[], handoff: Handoff) {
  if (tokenParts.length < 2) {
    throw new AuthError("Moodle token callback did not contain a token", {
      code: "oauth_callback_missing_token",
    });
  }

  let siteOrigin = normalizeSiteOrigin(handoff.siteOrigin);
  let signature = md5(siteOrigin + handoff.passport);
  if (signature !== tokenParts[0]) {
    siteOrigin = toggleHTTPProtocol(siteOrigin);
    signature = md5(siteOrigin + handoff.passport);
  }

  if (signature !== tokenParts[0]) {
    throw new AuthError("Moodle token callback signature did not match", {
      code: "oauth_callback_invalid_signature",
    });
  }

  return {
    siteOrigin,
    token: tokenParts[1]!,
    privateToken: tokenParts[2],
  };
}

function splitBrowserTokenPayload(rawURL: string) {
  const decoded = decodeURIComponent(rawURL);
  const payload = decoded.startsWith("moodlemobile://")
    ? decoded.slice("moodlemobile://".length)
    : decoded;

  if (payload.includes(":::")) {
    return payload.split(":::");
  }

  return payload.split(":").filter(Boolean);
}

function siteOriginFromDirectCallback(url: URL) {
  if (url.host) {
    const path = url.pathname === "/" ? "" : url.pathname;
    return normalizeSiteOrigin(`https://${url.host}${path}`);
  }

  const payload = url.href
    .slice("moodlemobile://".length)
    .split("?", 1)[0]
    ?.trim();
  if (!payload) {
    throw new AuthError("Moodle token callback did not contain a site URL", {
      code: "oauth_callback_missing_site",
    });
  }

  return normalizeSiteOrigin(
    payload.startsWith("http://") || payload.startsWith("https://")
      ? payload
      : `https://${payload}`,
  );
}

export function normalizeSiteOrigin(value: string) {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  while (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString().replace(/\/$/, "");
}

function toggleHTTPProtocol(siteOrigin: string) {
  if (siteOrigin.startsWith("https://")) {
    return siteOrigin.replace(/^https:\/\//, "http://");
  }
  if (siteOrigin.startsWith("http://")) {
    return siteOrigin.replace(/^http:\/\//, "https://");
  }
  return siteOrigin;
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}
