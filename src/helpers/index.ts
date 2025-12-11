import { getPreferenceValues, Keyboard } from "@raycast/api";
import { decode } from "html-entities";

export const preferences = getPreferenceValues<Preferences>();
export const siteHostname = new URL(preferences.site_url).hostname;

export const stripHTML = (html: string) => decode(html.replace(/<[^>]+>/g, "")).trim();

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

export const shortcut = (key: Keyboard.KeyEquivalent, additionalModifiers: Keyboard.KeyModifier[] = []) =>
  ({
    macOS: { modifiers: ["cmd", ...additionalModifiers], key },
    Windows: { modifiers: ["ctrl", ...additionalModifiers], key },
  }) satisfies Keyboard.Shortcut;

export const getUrlForService = (service: string, token: string, params: object = {}) =>
  `${preferences.site_url}/webservice/rest/server.php?${new URLSearchParams({ wsfunction: service, ...params, wstoken: token, moodlewssettinglang: "en", moodlewsrestformat: "json" })}`;
