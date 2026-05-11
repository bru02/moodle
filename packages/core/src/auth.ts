import { AuthError } from "./errors";
import {
  getMoodleErrorCode,
  getMoodleErrorMessage,
  isMoodleErrorPayload,
} from "./moodle-errors";
import {
  AuthMethod,
  type CoreWSExternalWarning,
  type MoodleAccount,
  type MoodleAutologinKeyResponse,
  type MoodleFetchLike,
  type MoodlePublicConfig,
  type MoodleSession,
  type MoodleSiteCheckResult,
  type MoodleSiteInfo,
  type MoodleTokenResponse,
  TypeOfLogin,
} from "./moodle-types";
import { fetchJson, normalizeSiteOrigin } from "./network";
import { buildMoodleWSUrl } from "./utils";

function createSession(input: {
  siteOrigin: string;
  token: string;
  privateToken?: string;
  siteInfo: MoodleSiteInfo;
  now?: number;
  authMethod: AuthMethod;
}): MoodleSession {
  const siteOrigin = normalizeSiteOrigin(input.siteOrigin);
  const userId = input.siteInfo.userid ?? 0;
  const username = input.siteInfo.username;
  const fullname = input.siteInfo.fullname;
  const account: MoodleAccount = {
    id: `${siteOrigin}:${userId}:${username ?? "unknown"}`,
    siteOrigin,
    userId,
    username,
    fullname,
    avatarUrl: input.siteInfo.userpictureurl,
    authMethod: input.authMethod,
    label: fullname ?? username ?? siteOrigin,
  };

  return {
    account,
    siteOrigin,
    token: input.token,
    privateToken: input.privateToken,
    accessKey: input.siteInfo.userprivateaccesskey ?? "",
    authenticatedAt: input.now ?? Date.now(),
    authMethod: input.authMethod,
    siteInfo: input.siteInfo,
  };
}

function parseTokenResponse(payload: unknown): MoodleTokenResponse {
  if (Array.isArray(payload)) {
    const first = payload[0] as { data?: MoodleTokenResponse } | undefined;
    return first?.data ?? {};
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data?: MoodleTokenResponse }).data ?? {};
  }

  return (payload as MoodleTokenResponse) ?? {};
}

function throwOnAuthPayload(
  payload: unknown,
  fallbackMessage: string,
  code?: string,
): never {
  const message = getMoodleErrorMessage(payload) ?? fallbackMessage;
  const errorCode = getMoodleErrorCode(payload) ?? code;
  throw new AuthError(message, { code: errorCode });
}

function createAjaxRequestBody(method: string, args: Record<string, unknown>) {
  return JSON.stringify([
    {
      index: 0,
      methodname: method,
      args,
    },
  ]);
}

async function fetchAjaxJson(input: {
  fetcher?: MoodleFetchLike;
  siteOrigin: string;
  method: string;
  args?: Record<string, unknown>;
  lang?: string;
  useGet?: boolean;
  noLogin?: boolean;
}) {
  const siteOrigin = normalizeSiteOrigin(input.siteOrigin);
  const lang = input.lang ?? "en";
  const script = input.noLogin ? "service-nologin.php" : "service.php";
  const body = createAjaxRequestBody(input.method, input.args ?? {});
  const baseUrl = `${siteOrigin}/lib/ajax/${script}?info=${encodeURIComponent(input.method)}&lang=${encodeURIComponent(lang)}`;

  if (input.useGet) {
    return await fetchJson({
      fetcher: input.fetcher,
      url: `${baseUrl}&args=${encodeURIComponent(body)}`,
      init: {
        method: "GET",
        headers: {
          "User-Agent": "MoodleMobile",
        },
      },
    });
  }

  return await fetchJson({
    fetcher: input.fetcher,
    url: baseUrl,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MoodleMobile",
      },
      body,
    },
  });
}

function parseAjaxResponse<T>(payload: unknown): T {
  if (!payload || typeof payload !== "object") {
    throw new AuthError("Invalid Moodle response", {
      code: "invalid_response",
    });
  }

  if ("error" in payload && (payload as { error?: unknown }).error) {
    throwOnAuthPayload(payload, "Moodle request failed");
  }

  if (Array.isArray(payload)) {
    const first = payload[0] as
      | { error?: unknown; data?: T; exception?: unknown }
      | undefined;
    if (!first) {
      throw new AuthError("Invalid Moodle response", {
        code: "invalid_response",
      });
    }
    if (first.error || first.exception) {
      throwOnAuthPayload(first, "Moodle request failed");
    }
    return (first.data ?? {}) as T;
  }

  if ("data" in payload) {
    return ((payload as { data?: T }).data ?? {}) as T;
  }

  return payload as T;
}

function validatePublicConfig(
  siteOrigin: string,
  config: MoodlePublicConfig,
): MoodlePublicConfig {
  if (!config.enablewebservices) {
    throw new AuthError(`Web services are not enabled for ${siteOrigin}`, {
      code: "webservicesnotenabled",
    });
  }

  if (!config.enablemobilewebservice) {
    throw new AuthError(`Mobile services are not enabled for ${siteOrigin}`, {
      code: "mobileservicesnotenabled",
    });
  }

  if (config.maintenanceenabled) {
    throw new AuthError(
      config.maintenancemessage || "This Moodle site is in maintenance mode",
      {
        code: "siteinmaintenance",
      },
    );
  }

  return config;
}

function toggleWww(siteOrigin: string) {
  const parsed = new URL(siteOrigin);
  if (parsed.hostname.startsWith("www.")) {
    parsed.hostname = parsed.hostname.slice(4);
  } else {
    parsed.hostname = `www.${parsed.hostname}`;
  }
  return parsed.toString().replace(/\/$/, "");
}

async function createSessionFromTokenResponse(input: {
  siteOrigin: string;
  token: string;
  privateToken?: string;
  fetcher?: MoodleFetchLike;
  now?: number;
  authMethod: AuthMethod;
}) {
  const siteInfo = await fetchSiteInfo({
    siteOrigin: input.siteOrigin,
    token: input.token,
    fetcher: input.fetcher,
  });

  return createSession({
    siteOrigin: input.siteOrigin,
    token: input.token,
    privateToken: input.privateToken,
    siteInfo,
    now: input.now,
    authMethod: input.authMethod,
  });
}

async function fetchPublicConfigAttempt(input: {
  siteOrigin: string;
  fetcher?: MoodleFetchLike;
}) {
  const siteOrigin = normalizeSiteOrigin(input.siteOrigin);

  try {
    const { response, payload } = await fetchAjaxJson({
      fetcher: input.fetcher,
      siteOrigin,
      method: "tool_mobile_get_public_config",
      noLogin: true,
    });
    if (!response.ok) {
      throwOnAuthPayload(
        payload,
        response.statusText || "Failed to fetch Moodle site config",
        "site_config_failed",
      );
    }
    return parseAjaxResponse<MoodlePublicConfig>(payload);
  } catch (error) {
    const { response, payload } = await fetchAjaxJson({
      fetcher: input.fetcher,
      siteOrigin,
      method: "tool_mobile_get_public_config",
      noLogin: true,
      useGet: true,
    });

    if (!response.ok) {
      if (error instanceof Error) {
        throw error;
      }
      throwOnAuthPayload(
        payload,
        response.statusText || "Failed to fetch Moodle site config",
        "site_config_failed",
      );
    }

    return parseAjaxResponse<MoodlePublicConfig>(payload);
  }
}

export async function fetchPublicConfig(input: {
  siteOrigin: string;
  fetcher?: MoodleFetchLike;
}) {
  const config = await fetchPublicConfigAttempt(input);
  return validatePublicConfig(input.siteOrigin, config);
}

export async function checkSite(input: {
  siteUrl: string;
  fetcher?: MoodleFetchLike;
}): Promise<MoodleSiteCheckResult> {
  const normalized = normalizeSiteOrigin(input.siteUrl);
  const candidates = Array.from(
    new Set([
      normalized,
      normalized.replace(/^https:\/\//i, "http://"),
      normalized.replace(/^http:\/\//i, "https://"),
      toggleWww(normalized),
      toggleWww(normalized.replace(/^https:\/\//i, "http://")),
      toggleWww(normalized.replace(/^http:\/\//i, "https://")),
    ]),
  ).filter(Boolean);

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const config = await fetchPublicConfig({
        siteOrigin: candidate,
        fetcher: input.fetcher,
      });
      const siteUrl = (
        config.httpswwwroot ||
        config.wwwroot ||
        candidate
      ).replace(/\/$/, "");
      return {
        code: config.typeoflogin || TypeOfLogin.APP,
        siteUrl,
        service: "moodle_mobile_app",
        config,
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new AuthError("Could not connect to this Moodle site", {
    code: "site_check_failed",
  });
}

export async function fetchSiteInfo(input: {
  siteOrigin: string;
  token: string;
  fetcher?: MoodleFetchLike;
}) {
  const siteOrigin = normalizeSiteOrigin(input.siteOrigin);
  const { response, payload } = await fetchJson({
    fetcher: input.fetcher,
    url: buildMoodleWSUrl({
      siteOrigin,
      service: "core_webservice_get_site_info",
      token: input.token,
    }),
  });

  if (
    !response.ok ||
    isMoodleErrorPayload(payload) ||
    (payload && typeof payload === "object" && "message" in payload)
  ) {
    throwOnAuthPayload(
      payload,
      response.statusText || "Failed to fetch Moodle site info",
      "site_info_failed",
    );
  }

  return payload as MoodleSiteInfo;
}

export async function authenticateWithCredentials(input: {
  siteOrigin: string;
  username: string;
  password: string;
  fetcher?: MoodleFetchLike;
  now?: number;
}) {
  const siteOrigin = normalizeSiteOrigin(input.siteOrigin);
  if (!input.username || !input.password) {
    throw new AuthError("Missing username or password", {
      code: "missing_credentials",
    });
  }

  const { response, payload } = await fetchJson({
    fetcher: input.fetcher,
    url: `${siteOrigin}/login/token.php?lang=en`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: input.username,
        password: input.password,
        service: "moodle_mobile_app",
      }).toString(),
    },
  });

  const tokenResponse = parseTokenResponse(payload);
  if (!response.ok || !tokenResponse.token) {
    throwOnAuthPayload(payload, "Login failed", "login_failed");
  }

  return await createSessionFromTokenResponse({
    siteOrigin,
    token: tokenResponse.token,
    privateToken: tokenResponse.privatetoken,
    fetcher: input.fetcher,
    now: input.now,
    authMethod: AuthMethod.PASSWORD,
  });
}

export async function authenticateWithToken(input: {
  siteOrigin: string;
  token: string;
  privateToken?: string;
  fetcher?: MoodleFetchLike;
  now?: number;
}) {
  const siteOrigin = normalizeSiteOrigin(input.siteOrigin);
  if (!input.token) {
    throw new AuthError("Missing token", { code: "missing_token" });
  }

  const siteInfo = await fetchSiteInfo({
    siteOrigin,
    token: input.token,
    fetcher: input.fetcher,
  });

  return createSession({
    siteOrigin,
    token: input.token,
    privateToken: input.privateToken,
    siteInfo,
    now: input.now,
    authMethod: AuthMethod.TOKEN,
  });
}

export async function authenticateWithQrLogin(input: {
  siteOrigin: string;
  qrLoginKey: string;
  userId: string | number;
  fetcher?: MoodleFetchLike;
  now?: number;
  lang?: string;
}) {
  const siteOrigin = normalizeSiteOrigin(input.siteOrigin);
  const lang = input.lang ?? "en";
  const { response, payload } = await fetchJson({
    fetcher: input.fetcher,
    url: `${siteOrigin}/lib/ajax/service-nologin.php?info=tool_mobile_get_tokens_for_qr_login&lang=${lang}`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MoodleMobile",
      },
      body: JSON.stringify([
        {
          index: 0,
          methodname: "tool_mobile_get_tokens_for_qr_login",
          args: {
            qrloginkey: input.qrLoginKey,
            userid: input.userId,
          },
        },
      ]),
    },
  });

  const tokenResponse = parseTokenResponse(payload);
  if (!response.ok || !tokenResponse.token) {
    throwOnAuthPayload(payload, "QR login failed", "qr_login_failed");
  }

  return await createSessionFromTokenResponse({
    siteOrigin,
    token: tokenResponse.token,
    privateToken: tokenResponse.privatetoken,
    fetcher: input.fetcher,
    now: input.now,
    authMethod: AuthMethod.QR,
  });
}

export async function refreshSession(input: {
  session: MoodleSession;
  reauthenticate: (input: { session: MoodleSession }) => Promise<MoodleSession>;
}) {
  return await input.reauthenticate({ session: input.session });
}

export async function fetchAutologinKey(input: {
  siteOrigin: string;
  token: string;
  privateToken: string;
  fetcher?: MoodleFetchLike;
}) {
  const siteOrigin = normalizeSiteOrigin(input.siteOrigin);
  const { response, payload } = await fetchJson({
    fetcher: input.fetcher,
    url: buildMoodleWSUrl({
      siteOrigin,
      service: "tool_mobile_get_autologin_key",
      token: input.token,
    }),
    init: {
      method: "POST",
      headers: {
        "User-Agent": "MoodleMobile",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        privatetoken: input.privateToken,
      }).toString(),
    },
  });

  if (
    !response.ok ||
    isMoodleErrorPayload(payload) ||
    !payload ||
    typeof payload !== "object" ||
    !("autologinurl" in payload) ||
    !("key" in payload)
  ) {
    throwOnAuthPayload(
      payload,
      response.statusText || "Failed to fetch Moodle autologin key",
      "autologin_key_failed",
    );
  }

  return payload as MoodleAutologinKeyResponse;
}

export async function buildAuthenticatedOpenUrl(input: {
  siteOrigin: string;
  token: string;
  privateToken?: string;
  userId: number;
  destinationUrl: string;
  lastAutoLoginAt?: number;
  now?: number;
  fetcher?: MoodleFetchLike;
}) {
  const now = input.now ?? Date.now();
  const autoLoginWindowMs = 6 * 60 * 1000;

  if (
    input.lastAutoLoginAt != null &&
    now - input.lastAutoLoginAt < autoLoginWindowMs
  ) {
    return input.destinationUrl;
  }

  if (!input.privateToken) {
    return input.destinationUrl;
  }

  try {
    const autologin = await fetchAutologinKey({
      siteOrigin: input.siteOrigin,
      token: input.token,
      privateToken: input.privateToken,
      fetcher: input.fetcher,
    });

    return buildAutologinUrl({
      autologin,
      userId: input.userId,
      urlToGo: input.destinationUrl,
    });
  } catch {
    return input.destinationUrl;
  }
}

export function buildAutologinUrl(input: {
  autologin: MoodleAutologinKeyResponse;
  userId: number;
  urlToGo: string;
}) {
  const autologinUrl = new URL(input.autologin.autologinurl);
  autologinUrl.searchParams.set("key", input.autologin.key);
  autologinUrl.searchParams.set("userid", String(input.userId));
  autologinUrl.searchParams.set("urltogo", input.urlToGo);
  return autologinUrl.toString();
}

export type {
  CoreWSExternalWarning,
  MoodleAutologinKeyResponse,
  MoodlePublicConfig,
  MoodleSession,
  MoodleSiteCheckResult,
  MoodleSiteInfo,
};
