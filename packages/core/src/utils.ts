import { decode } from "html-entities";

export type Primitive = string | number | boolean;
export type RequestParams = Record<string, Primitive>;

const multilang2TagPattern =
  /{\s*mlang\s+((?:[a-z0-9_-]+)(?:\s*,\s*[a-z0-9_-]+\s*)*)\s*}([\s\S]*?){\s*mlang\s*}/gim;
const inlineDataImagePattern = /<img\b[^>]*\bsrc=(["'])data:[^"']+\1[^>]*>/gi;
const nolinkSpanPattern =
  /<span\b[^>]*class=(["'])[^"']*\bnolink\b[^"']*\1[^>]*>([\s\S]*?)<\/span>/gi;
const mathJaxSpanPattern =
  /<span\b[^>]*class=(["'])[^"']*\bfilter_mathjaxloader_equation\b[^"']*\1[^>]*>([\s\S]*?)<\/span>/gi;

export function stripHTML(html: string) {
  return cleanMoodleHtml(html);
}

export function cleanMoodleText(text: string, language = "en") {
  return decode(selectMoodleLanguage(text, language).replace(/<[^>]+>/g, " "))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanMoodleHtml(html: string, language = "en") {
  return decode(selectMoodleLanguage(html, language).replace(/<[^>]+>/g, " "))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripInlineDataImages(content: string) {
  if (!content || !content.includes("data:")) {
    return content;
  }

  return content.replace(inlineDataImagePattern, "");
}

export function unwrapNolinkSpans(content: string) {
  if (!content || !content.includes("nolink")) {
    return content;
  }

  return content.replace(nolinkSpanPattern, "$2");
}

export function unwrapMathJaxLoaderSpans(content: string) {
  if (!content || !content.includes("filter_mathjaxloader_equation")) {
    return content;
  }

  return content.replace(mathJaxSpanPattern, "$2");
}

export { selectMoodleLanguage };

export function buildMoodleWSUrl(params: {
  siteOrigin: string;
  service: string;
  token: string;
  requestParams?: Record<string, Primitive>;
}) {
  const { siteOrigin, service, token, requestParams = {} } = params;
  const origin = siteOrigin.replace(/\/$/, "");
  return `${origin}/webservice/rest/server.php?${new URLSearchParams({
    wsfunction: service,
    ...requestParams,
    wstoken: token,
    moodlewssettinglang: "en",
    moodlewsrestformat: "json",
  })}`;
}

export function normalizeRequestParams(
  input: Record<string, unknown>,
): RequestParams {
  const output: RequestParams = {};
  appendRequestParams(output, input);

  return output;
}

function appendRequestParams(
  output: RequestParams,
  value: unknown,
  prefix?: string,
) {
  if (value == null) {
    return;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    if (prefix) {
      output[prefix] = value;
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      appendRequestParams(output, value[index], `${prefix ?? ""}[${index}]`);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}[${key}]` : key;
    appendRequestParams(output, nestedValue, nextPrefix);
  }
}

function selectMoodleLanguage(content: string, language: string) {
  if (!content || content.indexOf("mlang") === -1) {
    return content;
  }

  const parentLanguage = getParentLanguage(language);
  const [currentResult, currentReplacementDone] = replaceMultilang2Blocks(
    content,
    language,
    parentLanguage,
  );
  if (currentReplacementDone) {
    return currentResult;
  }

  const [otherResult] = replaceMultilang2Blocks(content, "other");
  return otherResult;
}

function replaceMultilang2Blocks(
  content: string,
  replaceLanguage: string,
  parentLanguage?: string,
): [string, boolean] {
  let replacementDone = false;
  const normalizedTargetLanguage = normalizeLanguage(replaceLanguage);
  const normalizedParentLanguage = parentLanguage
    ? normalizeLanguage(parentLanguage)
    : undefined;

  const replaced = content.replace(
    multilang2TagPattern,
    (_, languages: string, blockContent: string) => {
      const blockLanguages = languages
        .replace(/\s/g, "")
        .split(",")
        .map((language) => normalizeLanguage(language));

      for (const blockLanguage of blockLanguages) {
        if (
          blockLanguage === normalizedTargetLanguage ||
          (normalizedParentLanguage &&
            blockLanguage === normalizedParentLanguage)
        ) {
          replacementDone = true;
          return blockContent;
        }
      }

      return "";
    },
  );

  return [replaced, replacementDone];
}

function getParentLanguage(language: string): string | undefined {
  const separatorIndex = language.indexOf("-");
  if (separatorIndex <= 0) {
    return undefined;
  }

  return language.slice(0, separatorIndex);
}

function normalizeLanguage(language: string): string {
  return language.replace(/_/g, "-").toLowerCase();
}
