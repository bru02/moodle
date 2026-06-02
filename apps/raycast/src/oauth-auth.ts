import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  AuthError,
  authenticateWithToken,
  checkSite,
  type MoodleIdentityProvider,
  type MoodleSession,
  TypeOfLogin,
} from "@moodle/core";
import { environment, OAuth } from "@raycast/api";

import { requestCredentialsLogin } from "./credentials-login-request";
import {
  buildMoodleLaunchURL,
  getIdentityProviderOAuthId,
  getValidIdentityProvidersForConfig,
  normalizeSiteOrigin,
  parseMoodleMobileCallback,
} from "./moodle-oauth-callback";

const execFileAsync = promisify(execFile);

const STATE_PATH =
  process.platform === "win32"
    ? join(tmpdir(), ".moodle-oauth-state")
    : "/tmp/.moodle-oauth-state";
const APP_ASSET_PATH = join(environment.assetsPath, "MoodleOAuthCallback.app");
const LSREGISTER =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
const CODESIGN = "/usr/bin/codesign";
const OSASCRIPT = "/usr/bin/osascript";
const XATTR = "/usr/bin/xattr";
const REG = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "reg.exe",
);
const POWERSHELL = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

type HandoffState = {
  state: string;
  packageName: string;
  redirectURI: string;
  siteOrigin: string;
  passport: string;
};

export type MoodleOAuthResult = {
  callbackURL: string;
  token: string;
  privateToken?: string;
  siteOrigin: string;
  session: MoodleSession;
};

type BrowserLaunchInput = {
  siteUrl: string;
  launchUrl?: string;
  extraParams?: Record<string, string>;
};

export async function prepareMoodleOAuthCallbackApp() {
  if (process.platform === "win32") {
    await prepareWindowsMoodleOAuthCallback();
    return;
  }

  if (process.platform !== "darwin") {
    throw new AuthError(
      `Moodle browser sign-in is not supported on ${process.platform}`,
      {
        code: "oauth_callback_platform_unsupported",
      },
    );
  }

  try {
    await execFileAsync(XATTR, [
      "-dr",
      "com.apple.quarantine",
      APP_ASSET_PATH,
    ]).catch(() => undefined);
    await execFileAsync(CODESIGN, [
      "--force",
      "--deep",
      "--sign",
      "-",
      APP_ASSET_PATH,
    ]);
    await execFileAsync(LSREGISTER, ["-f", APP_ASSET_PATH]);
    await execFileAsync(OSASCRIPT, [
      "-l",
      "JavaScript",
      "-e",
      [
        "ObjC.import('CoreServices');",
        '$.LSSetDefaultHandlerForURLScheme($("moodlemobile"), $("dev.bruno.MoodleOAuthCallback"));',
      ].join(""),
    ]);
  } catch (error) {
    throw new AuthError(
      `Failed to prepare Moodle OAuth callback app at ${APP_ASSET_PATH}`,
      {
        code: "oauth_callback_app_prepare_failed",
        details: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

async function prepareWindowsMoodleOAuthCallback() {
  const command = [
    quoteWindowsArg(POWERSHELL),
    "-NoProfile",
    "-WindowStyle Hidden",
    "-ExecutionPolicy Bypass",
    "-Command",
    quoteWindowsArg(getWindowsProtocolHandlerScript()),
    '"%1"',
  ].join(" ");

  try {
    await execFileAsync(REG, [
      "add",
      "HKCU\\Software\\Classes\\moodlemobile",
      "/ve",
      "/d",
      "URL:moodlemobile Protocol",
      "/f",
    ]);
    await execFileAsync(REG, [
      "add",
      "HKCU\\Software\\Classes\\moodlemobile",
      "/v",
      "URL Protocol",
      "/d",
      "",
      "/f",
    ]);
    await execFileAsync(REG, [
      "add",
      "HKCU\\Software\\Classes\\moodlemobile\\shell\\open\\command",
      "/ve",
      "/d",
      command,
      "/f",
    ]);
  } catch (error) {
    throw new AuthError("Failed to register Moodle OAuth callback protocol", {
      code: "oauth_callback_protocol_register_failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

function getWindowsProtocolHandlerScript() {
  const statePath = STATE_PATH.replace(/'/g, "''");
  return [
    "param([string]$callbackUrl)",
    `$handoff = Get-Content -Raw -LiteralPath '${statePath}' | ConvertFrom-Json`,
    "$bytes = [Text.Encoding]::UTF8.GetBytes($callbackUrl)",
    "$code = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')",
    "$packageName = [uri]::EscapeDataString([string]$handoff.packageName)",
    "$state = [uri]::EscapeDataString([string]$handoff.state)",
    "$code = [uri]::EscapeDataString($code)",
    'Start-Process "raycast://oauth?package_name=$packageName&state=$state&code=$code"',
  ].join("; ");
}

function quoteWindowsArg(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export async function authenticateWithMoodleOAuth(
  siteOrigin: string,
): Promise<MoodleOAuthResult> {
  const siteCheck = await checkSite({ siteUrl: siteOrigin });
  if (
    siteCheck.code !== TypeOfLogin.BROWSER &&
    siteCheck.code !== TypeOfLogin.EMBEDDED
  ) {
    const session = await requestCredentialsLogin({
      identityProviders: getValidIdentityProvidersForConfig(siteCheck.config),
      siteName: siteCheck.config.sitename,
    });
    return {
      callbackURL: "",
      token: session.token,
      privateToken: session.privateToken,
      siteOrigin: session.siteOrigin,
      session,
    };
  }

  return await authenticateWithBrowserLaunch({
    siteUrl: siteCheck.siteUrl,
    launchUrl: siteCheck.config.launchurl,
  });
}

export async function authenticateWithMoodleIdentityProvider(
  siteOrigin: string,
  provider: MoodleIdentityProvider,
): Promise<MoodleOAuthResult> {
  const siteCheck = await checkSite({ siteUrl: siteOrigin });
  const providerOAuthId = getIdentityProviderOAuthId(provider);
  const validProvider = getValidIdentityProvidersForConfig(
    siteCheck.config,
  ).find(
    (candidate) => getIdentityProviderOAuthId(candidate) === providerOAuthId,
  );
  const oauthId = validProvider
    ? getIdentityProviderOAuthId(validProvider)
    : null;
  if (!oauthId) {
    throw new AuthError("Moodle identity provider is not valid for this site", {
      code: "invalid_identity_provider",
    });
  }

  return await authenticateWithBrowserLaunch({
    siteUrl: siteCheck.siteUrl,
    launchUrl: siteCheck.config.launchurl,
    extraParams: { oauthsso: oauthId },
  });
}

async function authenticateWithBrowserLaunch(
  input: BrowserLaunchInput,
): Promise<MoodleOAuthResult> {
  const client = new OAuth.PKCEClient({
    redirectMethod: OAuth.RedirectMethod.App,
    providerName: "Moodle",
    providerId: "moodle",
    description: "Sign in to Moodle in your browser to connect Raycast.",
  });

  const passport = String(Math.random() * 1000);
  const launchURL = buildMoodleLaunchURL(
    input.siteUrl,
    passport,
    input.launchUrl,
    input.extraParams,
  );
  const request = await client.authorizationRequest({
    endpoint: "https://moodle.local/oauth-placeholder",
    clientId: "moodle",
    scope: "moodle",
  });

  const packageName =
    new URL(request.redirectURI).searchParams.get("package_name") ??
    "Extension";

  const handoff: HandoffState = {
    state: request.state,
    packageName,
    redirectURI: request.redirectURI,
    siteOrigin: normalizeSiteOrigin(input.siteUrl),
    passport,
  };

  await writeFile(STATE_PATH, JSON.stringify(handoff), "utf8");
  try {
    await prepareMoodleOAuthCallbackApp();

    const result = await client.authorize({
      url: launchURL,
    });

    const callbackURL = Buffer.from(
      result.authorizationCode,
      "base64url",
    ).toString("utf8");
    if (!callbackURL) {
      throw new AuthError("Moodle OAuth callback did not contain a URL", {
        code: "oauth_callback_missing_url",
      });
    }

    const tokens = parseMoodleMobileCallback(callbackURL, handoff);
    const session = await authenticateWithToken({
      siteOrigin: tokens.siteOrigin,
      token: tokens.token,
      privateToken: tokens.privateToken,
    });

    await client.setTokens({
      accessToken: tokens.token,
      refreshToken: tokens.privateToken,
      scope: "moodle",
    });

    return {
      callbackURL,
      token: tokens.token,
      privateToken: tokens.privateToken,
      siteOrigin: tokens.siteOrigin,
      session,
    };
  } finally {
    await rm(STATE_PATH, { force: true });
  }
}
