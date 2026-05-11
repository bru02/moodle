import { getPreferenceValues } from "@raycast/api";

export const preferences = getPreferenceValues<Preferences>();

const moodleAppPrefix = "moodlemobile://";

export const isQrAuth = preferences.site_url.startsWith(moodleAppPrefix);
export const siteUrl = new URL(
  preferences.site_url.replace(moodleAppPrefix, ""),
);
export const siteOrigin = siteUrl.origin;
