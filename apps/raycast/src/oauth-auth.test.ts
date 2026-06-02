import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildMoodleLaunchURL,
  getValidIdentityProvidersForConfig,
  normalizeSiteOrigin,
  parseMoodleMobileCallback,
} from "./moodle-oauth-callback";

test("builds Moodle mobile launch URL", () => {
  const url = new URL(
    buildMoodleLaunchURL("https://moodle.example.edu/", "123.45"),
  );

  assert.equal(
    url.toString(),
    "https://moodle.example.edu/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=123.45&urlscheme=moodlemobile#raycast",
  );
});

test("builds custom Moodle mobile launch URL", () => {
  const url = new URL(
    buildMoodleLaunchURL(
      "https://moodle.example.edu/",
      "123.45",
      "https://sso.example.edu/mobile-login?existing=1",
    ),
  );

  assert.equal(
    url.toString(),
    "https://sso.example.edu/mobile-login?existing=1&service=moodle_mobile_app&passport=123.45&urlscheme=moodlemobile#raycast",
  );
});

test("builds Moodle mobile launch URL with OAuth SSO provider", () => {
  const url = new URL(
    buildMoodleLaunchURL(
      "https://moodle.example.edu/",
      "123.45",
      "https://moodle.example.edu/admin/tool/mobile/launch.php",
      { oauthsso: "7" },
    ),
  );

  assert.equal(
    url.toString(),
    "https://moodle.example.edu/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=123.45&urlscheme=moodlemobile&oauthsso=7#raycast",
  );
});

test("accepts same-site OAuth identity providers with volatile params", () => {
  const providers = getValidIdentityProvidersForConfig({
    wwwroot: "https://evok.cserkesz.hu",
    httpswwwroot: "https://evok.cserkesz.hu",
    sitename: "EVOK",
    guestlogin: 0,
    rememberusername: 2,
    authloginviaemail: 1,
    registerauth: "email",
    forgottenpasswordurl: "",
    authinstructions: "",
    authnoneenabled: 0,
    enablewebservices: 1,
    enablemobilewebservice: 1,
    maintenanceenabled: 0,
    maintenancemessage: "",
    typeoflogin: 1,
    identityproviders: [
      {
        name: "ECSET",
        iconurl: "https://static.ecset.cserkesz.net/icon.svg",
        url: "https://evok.cserkesz.hu/auth/oauth2/login.php?id=1&wantsurl=%2F&sesskey=old",
      },
      {
        name: "External",
        iconurl: "",
        url: "https://login.example.com/auth/oauth2/login.php?id=2",
      },
    ],
  });

  assert.deepEqual(
    providers.map((provider) => provider.name),
    ["ECSET"],
  );
});

test("normalizes Moodle site URL without protocol", () => {
  assert.equal(
    normalizeSiteOrigin("moodle.example.edu"),
    "https://moodle.example.edu",
  );
});

test("normalizes Moodle site URL and removes query, hash, and trailing slash", () => {
  assert.equal(
    normalizeSiteOrigin("moodle.example.edu/path/?foo=bar#baz"),
    "https://moodle.example.edu/path",
  );
});

test("parses direct token callback", () => {
  assert.deepEqual(
    parseMoodleMobileCallback(
      "moodlemobile://moodle.example.edu?token=abc&privatetoken=def",
      { siteOrigin: "https://ignored.example.edu", passport: "123" },
    ),
    {
      siteOrigin: "https://moodle.example.edu",
      token: "abc",
      privateToken: "def",
    },
  );
});

test("validates browser SSO callback", () => {
  const siteOrigin = "https://moodle.example.edu";
  const passport = "123.45";
  const signature = createHash("md5")
    .update(`${siteOrigin}${passport}`)
    .digest("hex");

  assert.deepEqual(
    parseMoodleMobileCallback(`moodlemobile://${signature}:::abc:::def`, {
      siteOrigin,
      passport,
    }),
    {
      siteOrigin,
      token: "abc",
      privateToken: "def",
    },
  );
});

test("validates base64 token browser SSO callback", () => {
  const siteOrigin = "https://moodle.example.edu";
  const passport = "123.45";
  const signature = createHash("md5")
    .update(`${siteOrigin}${passport}`)
    .digest("hex");
  const encoded = Buffer.from(`${signature}:::abc:::def`).toString("base64url");

  assert.deepEqual(
    parseMoodleMobileCallback(`moodlemobile://token=${encoded}#/`, {
      siteOrigin,
      passport,
    }),
    {
      siteOrigin,
      token: "abc",
      privateToken: "def",
    },
  );
});
