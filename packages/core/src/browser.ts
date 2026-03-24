import { type MoodleSession } from "./moodle-types";

function normalizeSiteOrigin(siteOrigin: string) {
  return siteOrigin.replace(/\/$/, "");
}

function resolveUrl(url: string, base?: string) {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)) return new URL(url);
  if (base) return new URL(url, base);
  return new URL(url, "https://example.invalid");
}

export function handleMoodleFileUrl(input: {
  url: string;
  accessKey?: string;
  siteOrigin?: string;
  courseSvgProxyUrl?: string;
}) {
  const resolved = resolveUrl(input.url, input.siteOrigin ? normalizeSiteOrigin(input.siteOrigin) : undefined);
  let url = resolved.toString();

  if (input.accessKey) {
    url = url.replace(/(\/webservice)?\/pluginfile\.php/g, `/tokenpluginfile.php/${input.accessKey}`);
  }

  url = url.replaceAll("?forcedownload=1", "");

  if (/generated\/course\.svg(?:$|\?)/.test(url)) {
    const proxyUrl = input.courseSvgProxyUrl ?? "https://tune.toldy.me/svg";
    return `${proxyUrl}?u=${encodeURIComponent(url)}`;
  }

  return url;
}

export function buildExternalOpenUrl(input: {
  url: string;
  siteOrigin: string;
  accessKey?: string;
  semester?: string | number;
  courseSvgProxyUrl?: string;
}) {
  const handled = handleMoodleFileUrl({
    url: input.url,
    accessKey: input.accessKey,
    siteOrigin: input.siteOrigin,
    courseSvgProxyUrl: input.courseSvgProxyUrl,
  });
  const parsed = resolveUrl(handled, input.siteOrigin);
  const siteOrigin = normalizeSiteOrigin(input.siteOrigin);

  if (parsed.origin !== siteOrigin) {
    return handled;
  }

  if (parsed.pathname.includes("/pluginfile.php")) {
    return handled;
  }

  parsed.searchParams.set("semester", String(input.semester ?? -1));
  return parsed.toString();
}

export function buildOpenUrlForSession(input: {
  session: Pick<MoodleSession, "accessKey" | "siteOrigin">;
  url: string;
  semester?: string | number;
  courseSvgProxyUrl?: string;
}) {
  return buildExternalOpenUrl({
    url: input.url,
    siteOrigin: input.session.siteOrigin,
    accessKey: input.session.accessKey,
    semester: input.semester,
    courseSvgProxyUrl: input.courseSvgProxyUrl,
  });
}
