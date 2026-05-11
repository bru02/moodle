import { createDeeplink, useFetch } from "@raycast/utils";

import { handleFileUrl } from "../helpers/files";
import { turndown } from "../helpers/markdown";
import { siteOrigin } from "../helpers/preferences";
import { Content } from "../types";

const relativeUrlAttributeRegex =
  /(<(a|img)\b[^>]*\b(href|src)\s*=\s*['"])([^'"]+)(['"])/gi;

export function useRemoteHTMLResource(
  url: string | undefined,
  contents?: Content[],
  courseId?: number,
) {
  const handledUrl = url ? handleFileUrl(url) : "";

  return useFetch(handledUrl, {
    execute: !!url,
    mapResult(r: string) {
      const md = turndown(
        r.replace(
          relativeUrlAttributeRegex,
          (
            match,
            prefix: string,
            tagName: string,
            attributeName: string,
            attributeUrl: string,
            suffix: string,
          ) => {
            if (!shouldResolveRelativeUrl(attributeUrl)) {
              return rewriteActivityHref(
                match,
                tagName,
                attributeName,
                attributeUrl,
                courseId,
              );
            }

            const resolvedUrl = resolveModuleContentUrl(
              attributeUrl,
              handledUrl,
              contents ?? [],
            );
            const finalUrl =
              tagName.toLowerCase() === "a" &&
              attributeName.toLowerCase() === "href"
                ? rewriteActivityDeeplink(resolvedUrl, courseId)
                : resolvedUrl;
            return `${prefix}${finalUrl}${suffix}`;
          },
        ),
      );

      return {
        data: md,
      };
    },
  });
}

function shouldResolveRelativeUrl(url: string) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url);
}

function rewriteActivityHref(
  originalMatch: string,
  tagName: string,
  attributeName: string,
  attributeUrl: string,
  courseId?: number,
) {
  if (tagName.toLowerCase() !== "a" || attributeName.toLowerCase() !== "href") {
    return originalMatch;
  }

  return originalMatch.replace(
    attributeUrl,
    rewriteActivityDeeplink(attributeUrl, courseId),
  );
}

function resolveModuleContentUrl(
  url: string,
  baseUrl: string,
  contents: Content[],
) {
  const [path] = url.split(/[?#]/, 1);
  const normalizedPath = normalizeContentPath(path);
  const content = contents.find((item) => {
    const fullPath = normalizeContentPath(`${item.filepath}${item.filename}`);
    return (
      normalizedPath === fullPath ||
      normalizedPath === fullPath.slice(1) ||
      normalizedPath === item.filename
    );
  });

  if (content?.fileurl) {
    const resolvedContentUrl = new URL(handleFileUrl(content.fileurl));
    const [, search = "", hash = ""] = url.match(/([?][^#]*)?(#.*)?$/) ?? [];

    resolvedContentUrl.search = search;
    resolvedContentUrl.hash = hash;

    return resolvedContentUrl.toString();
  }

  return new URL(url, baseUrl).toString();
}

function normalizeContentPath(path: string) {
  const decodedPath = decodeURIComponent(path).replace(/\\/g, "/");
  const normalizedPath = decodedPath.replace(/\/+/g, "/");
  return normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
}

function rewriteActivityDeeplink(url: string, courseId?: number) {
  if (!courseId) {
    return url;
  }

  try {
    const parsedUrl = new URL(url, siteOrigin);
    if (
      parsedUrl.origin !== siteOrigin ||
      !/^\/mod\/[^/]+\/view\.php$/.test(parsedUrl.pathname)
    ) {
      return url;
    }

    const moduleId = parsedUrl.searchParams.get("id");
    if (!moduleId) {
      return url;
    }

    return createDeeplink({
      command: "search-courses",
      context: { courseId, preselectItem: Number(moduleId) },
    });
  } catch {
    return url;
  }
}
