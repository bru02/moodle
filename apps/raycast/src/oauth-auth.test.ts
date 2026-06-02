import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildMoodleLaunchURL,
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
