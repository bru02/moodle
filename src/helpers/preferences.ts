import { getPreferenceValues } from "@raycast/api";

export const preferences = getPreferenceValues<Preferences>();

const moodleAppPrefix = "moodlemobile://";

export const isQrAuth = preferences.site_url.startsWith(moodleAppPrefix);
export const siteUrl = new URL(preferences.site_url.replace(moodleAppPrefix, ""));
export const siteHostname = siteUrl.origin;
console.log({siteUrl, siteHostname})