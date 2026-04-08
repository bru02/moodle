import type { CoreCourseModuleContentFile } from "@moodle/core";
import {
  getYouTubeThumbnail,
  handleMoodleFileUrl,
  selectMoodleLanguage,
  stripInlineDataImages,
  unwrapMathJaxLoaderSpans,
  unwrapNolinkSpans,
} from "@moodle/core";

type HtmlContentRef = Pick<
  Partial<CoreCourseModuleContentFile>,
  "filename" | "filepath" | "fileurl"
>;

export const MOODLE_MATH_INLINE_TAG = "moodle-math-inline";
export const MOODLE_MATH_BLOCK_TAG = "moodle-math-block";

const iframePattern = /<iframe\b([^>]*)>(?:<\/iframe>)?/gi;
const mediaPattern = /<(audio|video)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const sourceTagPattern = /<source\b([^>]*)>/i;
const relativeUrlAttributePattern =
  /(<(a|img|source)\b[^>]*\b(href|src)\s*=\s*["'])([^"']+)(["'])/gi;
const pluginfileTokenPattern = /^@@PLUGINFILE@@/i;

export function prepareMoodleHtml(input: {
  html: string;
  baseUrl?: string;
  contents?: readonly HtmlContentRef[];
  siteOrigin?: string;
  accessKey?: string;
  language?: string;
}) {
  if (!input.html) {
    return "";
  }

  const language = input.language ?? "en";
  const normalizedContents = input.contents ?? [];
  let html = selectMoodleLanguage(input.html, language);

  html = stripInlineDataImages(html);
  html = unwrapNolinkSpans(html);
  html = unwrapMathJaxLoaderSpans(html);
  html = html.replace(iframePattern, (_match, attrs: string) =>
    buildIframeFallback(attrs),
  );
  html = html.replace(
    mediaPattern,
    (_match, tagName: string, attrs: string, innerHtml: string) =>
      buildMediaFallback(tagName, attrs, innerHtml),
  );
  html = replaceMathExpressions(html);

  return html.replace(
    relativeUrlAttributePattern,
    (
      match,
      prefix: string,
      _tagName: string,
      _attributeName: string,
      attributeUrl: string,
      suffix: string,
    ) => {
      const resolvedUrl = resolveRenderableUrl(attributeUrl, {
        baseUrl: input.baseUrl,
        contents: normalizedContents,
        siteOrigin: input.siteOrigin,
        accessKey: input.accessKey,
      });

      if (!resolvedUrl) {
        return match;
      }

      return `${prefix}${escapeHtmlAttribute(resolvedUrl)}${suffix}`;
    },
  );
}

export function extractMoodleActivityModuleId(
  url: string,
  siteOrigin?: string,
) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url, siteOrigin ?? "https://example.invalid");
    if (siteOrigin && parsed.origin !== normalizeOrigin(siteOrigin)) {
      return null;
    }

    if (!/^\/mod\/[^/]+\/view\.php$/.test(parsed.pathname)) {
      return null;
    }

    const moduleId = parsed.searchParams.get("id");
    return moduleId && /^\d+$/.test(moduleId) ? moduleId : null;
  } catch {
    return null;
  }
}

function buildIframeFallback(attrs: string) {
  const src = getHtmlAttribute(attrs, "src");
  if (!src) {
    return "";
  }

  const title = getHtmlAttribute(attrs, "title") || src;
  const thumbnail = getYouTubeThumbnail(src);

  if (thumbnail) {
    return `<p><a href="${escapeHtmlAttribute(src)}"><img src="${escapeHtmlAttribute(thumbnail)}" alt="${escapeHtmlAttribute(
      title,
    )}" /></a></p><p><a href="${escapeHtmlAttribute(src)}">${escapeHtmlText(title)}</a></p>`;
  }

  return `<p><a href="${escapeHtmlAttribute(src)}">${escapeHtmlText(title)}</a></p>`;
}

function buildMediaFallback(tagName: string, attrs: string, innerHtml: string) {
  const sourceAttributes = innerHtml.match(sourceTagPattern)?.[1] ?? "";
  const src =
    getHtmlAttribute(attrs, "src") || getHtmlAttribute(sourceAttributes, "src");

  if (!src) {
    return "";
  }

  const label = tagName.toLowerCase() === "video" ? "Open video" : "Open audio";
  return `<p><a href="${escapeHtmlAttribute(src)}">${label}</a></p>`;
}

function resolveRenderableUrl(
  url: string,
  input: {
    baseUrl?: string;
    contents: readonly HtmlContentRef[];
    siteOrigin?: string;
    accessKey?: string;
  },
) {
  if (!url || url.startsWith("#") || /^data:/i.test(url)) {
    return url;
  }

  const contentMappedUrl = resolveContentMappedUrl(url, input.contents);
  if (contentMappedUrl) {
    return handleMoodleFileUrl({
      url: contentMappedUrl,
      accessKey: input.accessKey,
      siteOrigin: input.siteOrigin,
    });
  }

  try {
    const resolved = isRelativeUrl(url)
      ? new URL(url, input.baseUrl)
      : new URL(url, input.siteOrigin);
    return handleMoodleFileUrl({
      url: resolved.toString(),
      accessKey: input.accessKey,
      siteOrigin: input.siteOrigin,
    });
  } catch {
    return url;
  }
}

function resolveContentMappedUrl(
  url: string,
  contents: readonly HtmlContentRef[],
) {
  if (!contents.length) {
    return null;
  }

  const [path] = url.replace(pluginfileTokenPattern, "").split(/[?#]/, 1);
  const normalizedPath = normalizeContentPath(path);
  const content = contents.find((item) => {
    const fullPath = normalizeContentPath(
      `${item.filepath ?? ""}${item.filename ?? ""}`,
    );
    return (
      normalizedPath === fullPath ||
      normalizedPath === fullPath.slice(1) ||
      normalizedPath === item.filename
    );
  });

  return content?.fileurl ?? null;
}

function normalizeContentPath(path: string) {
  const decodedPath = decodeURIComponent(path).replace(/\\/g, "/");
  const normalizedPath = decodedPath.replace(/\/+/g, "/");
  return normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
}

function isRelativeUrl(url: string) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url);
}

function getHtmlAttribute(source: string, name: string) {
  const match = source.match(
    new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"),
  );
  return match?.[2] ?? "";
}

function replaceMathExpressions(text: string) {
  if (!text || !hasMathDelimiters(text) || hasMathRenderTags(text)) {
    return text;
  }

  let cursor = 0;
  let i = 1;
  let displayStart = -1;
  let displayBracket = false;
  let displayDollar = false;
  let inlineStart = -1;
  let output = "";

  while (i < text.length) {
    if (displayStart === -1) {
      if (text[i - 1] === "\\") {
        if (text[i] === "[") {
          displayStart = i - 1;
          displayBracket = true;
        } else if (text[i] === "(") {
          inlineStart = i - 1;
        } else if (text[i] === ")" && inlineStart > -1) {
          output += text.slice(cursor, inlineStart);
          output += buildMathTag(text.slice(inlineStart, i + 1), false);
          cursor = i + 1;
          inlineStart = -1;
        }
      } else if (text[i - 1] === "$" && text[i] === "$") {
        displayStart = i - 1;
        displayDollar = true;
      }
    } else if (
      (text[i - 1] === "\\" && text[i] === "]" && displayBracket) ||
      (text[i - 1] === "$" && text[i] === "$" && displayDollar)
    ) {
      output += text.slice(cursor, displayStart);
      output += buildMathTag(text.slice(displayStart, i + 1), true);
      cursor = i + 1;
      displayStart = -1;
      displayBracket = false;
      displayDollar = false;
    }

    i += 1;
  }

  if (!output) {
    return text;
  }

  return `${output}${text.slice(cursor)}`;
}

function hasMathDelimiters(text: string) {
  return text.includes("\\(") || text.includes("\\[") || text.includes("$$");
}

function hasMathRenderTags(text: string) {
  return (
    text.includes(`<${MOODLE_MATH_INLINE_TAG}`) ||
    text.includes(`<${MOODLE_MATH_BLOCK_TAG}`)
  );
}

function buildMathTag(latex: string, displayMode: boolean) {
  const tagName = displayMode ? MOODLE_MATH_BLOCK_TAG : MOODLE_MATH_INLINE_TAG;
  return `<${tagName} data-latex="${escapeHtmlAttribute(latex)}"></${tagName}>`;
}

function normalizeOrigin(origin: string) {
  return origin.replace(/\/$/, "");
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
