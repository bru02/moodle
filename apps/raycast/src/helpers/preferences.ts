import { getPreferenceValues } from "@raycast/api";

export const preferences = getPreferenceValues<Preferences>();
export const siteUrl = new URL(preferences.site_url);
export const siteOrigin = siteUrl.origin;
