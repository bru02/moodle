import { handleMoodleFileUrl } from "@moodle/core";

export function resolveMoodleImageUrl(input: {
  url?: string | null;
  siteOrigin?: string;
  accessKey?: string;
}) {
  if (!input.url) {
    return undefined;
  }

  try {
    return handleMoodleFileUrl({
      url: input.url,
      siteOrigin: input.siteOrigin,
      accessKey: input.accessKey,
    });
  } catch {
    return input.url;
  }
}
