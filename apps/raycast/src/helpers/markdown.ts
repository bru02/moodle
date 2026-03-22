import { gfm } from "@bwat47/turndown-plugin-gfm";
import TurndownService from "turndown";

import { handleFileUrl } from "./files";

type MarkdownLoader = (content: string) => string;

export const turndownService = new TurndownService();

turndownService.use(gfm);

type NodeWithSiblings = {
  nodeName?: string;
  nodeType?: number;
  previousSibling?: NodeWithSiblings | null;
  nextSibling?: NodeWithSiblings | null;
  textContent?: string | null;
};

const textNodeType = 3;
const youtubeVideoIdPattern = /^[\w-]{11}$/;
const multilang2TagPattern = /{\s*mlang\s+((?:[a-z0-9_-]+)(?:\s*,\s*[a-z0-9_-]+\s*)*)\s*}([\s\S]*?){\s*mlang\s*}/gim;
const leadingPunctuationOrWhitespace = /^[\p{P}\s]+/u;
const trailingPunctuationOrWhitespace = /[\p{P}\s]+$/u;
const wordCharacter = /[\p{L}\p{N}]/u;
const inlineDataImagePattern = /<img\b[^>]*\bsrc=(["'])data:[^"']+\1[^>]*>/gi;

function isStrongLike(node: NodeWithSiblings | null | undefined): boolean {
  if (!node?.nodeName) return false;
  const name = node.nodeName.toLowerCase();
  return name === "strong" || name === "b";
}

function isWordCharacter(value: string | null): boolean {
  if (!value) return false;
  return wordCharacter.test(value);
}

function getBoundaryCharacter(node: NodeWithSiblings, direction: "previousSibling" | "nextSibling"): string | null {
  let sibling = node[direction] ?? null;

  while (sibling) {
    const text = sibling.textContent ?? "";
    if (text.length > 0) {
      return direction === "previousSibling" ? text[text.length - 1] : text[0];
    }
    sibling = sibling[direction] ?? null;
  }

  return null;
}

function getMeaningfulSibling(
  node: NodeWithSiblings,
  direction: "previousSibling" | "nextSibling",
): NodeWithSiblings | null {
  let sibling = node[direction] ?? null;

  while (sibling) {
    if (sibling.nodeType !== textNodeType) return sibling;
    if (sibling.textContent?.trim()) return sibling;
    sibling = sibling[direction] ?? null;
  }

  return null;
}

turndownService.addRule("strong", {
  filter: ["strong", "b"],
  replacement: (content, node, options) => {
    if (!content.trim()) return content;

    const delimiter = options.strongDelimiter || "**";
    const normalizedNode = node as unknown as NodeWithSiblings;
    const previousBoundaryChar = getBoundaryCharacter(normalizedNode, "previousSibling");
    const nextBoundaryChar = getBoundaryCharacter(normalizedNode, "nextSibling");
    const previous = getMeaningfulSibling(normalizedNode, "previousSibling");
    const next = getMeaningfulSibling(normalizedNode, "nextSibling");

    const open = isStrongLike(previous) ? "" : delimiter;
    const close = isStrongLike(next) ? "" : delimiter;
    let before = "";
    let after = "";
    let emphasized = content;

    if (open && isWordCharacter(previousBoundaryChar)) {
      const leading = emphasized.match(leadingPunctuationOrWhitespace)?.[0] ?? "";
      if (leading) {
        before = leading;
        emphasized = emphasized.slice(leading.length);
      }
    }

    if (close && isWordCharacter(nextBoundaryChar)) {
      const trailing = emphasized.match(trailingPunctuationOrWhitespace)?.[0] ?? "";
      if (trailing) {
        after = trailing;
        emphasized = emphasized.slice(0, emphasized.length - trailing.length);
      }
    }

    if (!emphasized.trim()) {
      return `${before}${emphasized}${after}`;
    }

    return `${before}${open}${emphasized}${close}${after}`;
  },
});

turndownService.addRule("iframe", {
  filter: ["iframe"],
  replacement: (content, node) => {
    // @ts-expect-error no types
    const src = node.getAttribute("src");
    if (!src) return "";
    // @ts-expect-error no types
    const title = node.getAttribute("title") || src;
    const thumbnail = getYouTubeThumbnail(src);

    if (thumbnail) {
      return `[![${title}](${thumbnail})](${src})\n[${title}](${src})`;
    }

    return `[${title}](${src})`;
  },
});

turndownService.addRule("img", {
  filter: ["img"],
  replacement: (content, node) => {
    // @ts-expect-error no types
    const src = node.getAttribute("src");
    if (!src) return "";
    // @ts-expect-error no types
    const alt = node.getAttribute("alt") || "";
    return `![${alt}](${handleFileUrl(src)})`;
  },
});

const htmlLoaders: MarkdownLoader[] = [stripInlineDataImagesLoader, multilang2Loader];
const markdownLoaders: MarkdownLoader[] = [mathjaxNotationLoader];

export function turndown(html: string) {
  const normalizedHtml = htmlLoaders.reduce((content, loader) => loader(content), html);
  const markdown = turndownService.turndown(normalizedHtml);
  const result = markdownLoaders.reduce((content, loader) => loader(content), markdown);
  return result;
}

function stripInlineDataImagesLoader(content: string): string {
  if (!content || !content.includes("data:")) {
    return content;
  }

  return content.replace(inlineDataImagePattern, "");
}

function multilang2Loader(content: string): string {
  if (!content || content.indexOf("mlang") === -1) {
    return content;
  }

  const currentLanguage = "en";
  const parentLanguage = getParentLanguage(currentLanguage);

  const [currentResult, currentReplacementDone] = replaceMultilang2Blocks(content, currentLanguage, parentLanguage);
  if (currentReplacementDone) {
    return currentResult;
  }

  const [otherResult] = replaceMultilang2Blocks(content, "other");
  return otherResult;
}

function replaceMultilang2Blocks(content: string, replaceLanguage: string, parentLanguage?: string): [string, boolean] {
  let replacementDone = false;
  const normalizedTargetLanguage = normalizeLanguage(replaceLanguage);
  const normalizedParentLanguage = parentLanguage ? normalizeLanguage(parentLanguage) : undefined;

  const replaced = content.replace(multilang2TagPattern, (_, languages: string, blockContent: string) => {
    const blockLanguages = languages
      .replace(/\s/g, "")
      .split(",")
      .map((language) => normalizeLanguage(language));

    for (const blockLanguage of blockLanguages) {
      if (
        blockLanguage === normalizedTargetLanguage ||
        (normalizedParentLanguage && blockLanguage === normalizedParentLanguage)
      ) {
        replacementDone = true;
        return blockContent;
      }
    }

    return "";
  });

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

function mathjaxNotationLoader(content: string): string {
  const escapedBackslash = /\\\\\\\\/g;
  const normalize = (expression: string) => expression.replace(escapedBackslash, "\\").trim();

  const spanWrapper = "(?:<span[^>]*>\\s*)?";
  const closingSpan = "(?:\\s*<\\/span>)?";
  const displayMathRegex = new RegExp(
    `(^|[^\\\\])${spanWrapper}(?:\\\\){1,2}\\[([\\s\\S]+?)(?:\\\\){1,2}\\]${closingSpan}`,
    "gi",
  );
  const inlineMathRegex = new RegExp(
    `(^|[^\\\\])${spanWrapper}(?:\\\\){1,2}\\(([\\s\\S]+?)(?:\\\\){1,2}\\)${closingSpan}`,
    "gi",
  );

  return content
    .replace(displayMathRegex, (_, prefix, expression) => {
      return `${prefix}\\[${normalize(expression)}\\]`;
    })
    .replace(inlineMathRegex, (_, prefix, expression) => {
      return `${prefix}\\(${normalize(expression)}\\)`;
    });
}

function getYouTubeThumbnail(src: string): string | null {
  const videoId = getYouTubeVideoId(src);
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function getYouTubeVideoId(src: string): string | null {
  try {
    const url = new URL(src);
    const hostname = url.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      return normalizeYouTubeVideoId(url.pathname.slice(1));
    }

    if (!["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(hostname)) {
      return null;
    }

    if (url.pathname.startsWith("/embed/")) {
      return normalizeYouTubeVideoId(url.pathname.split("/")[2]);
    }

    if (url.pathname === "/watch") {
      return normalizeYouTubeVideoId(url.searchParams.get("v"));
    }

    if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")) {
      return normalizeYouTubeVideoId(url.pathname.split("/")[2]);
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeYouTubeVideoId(videoId: string | null | undefined): string | null {
  if (!videoId) return null;
  return youtubeVideoIdPattern.test(videoId) ? videoId : null;
}
