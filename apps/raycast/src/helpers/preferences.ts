import { getPreferenceValues } from "@raycast/api";
import { normalizeSiteOrigin } from "../moodle-oauth-callback";

export const preferences = getPreferenceValues<Preferences>();
export const siteUrl = new URL(normalizeSiteOrigin(preferences.site_url));
export const siteOrigin = siteUrl.origin;
