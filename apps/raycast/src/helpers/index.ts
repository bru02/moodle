import { buildMoodleWSUrl, stripHTML } from "@moodle/core";
import { Keyboard } from "@raycast/api";

import { siteOrigin } from "./preferences";

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

export const shortcut = (
  key: Keyboard.KeyEquivalent,
  additionalModifiers: Keyboard.KeyModifier[] = [],
) =>
  ({
    macOS: { modifiers: ["cmd", ...additionalModifiers], key },
    Windows: { modifiers: ["ctrl", ...additionalModifiers], key },
  }) satisfies Keyboard.Shortcut;

export const getUrlForService = (
  service: string,
  token: string,
  params: object = {},
) =>
  buildMoodleWSUrl({
    siteOrigin,
    service,
    token,
    requestParams: params as Record<string, string | number | boolean>,
  });

export { stripHTML };
