import { gfm } from "@bwat47/turndown-plugin-gfm";
import {
  getYouTubeThumbnail,
  selectMoodleLanguage,
  stripInlineDataImages,
  stripHTML,
} from "@moodle/core";
import TurndownService from "turndown";

import { handleFileUrl } from "./files";

type MarkdownLoader = (content: string) => string;

export const turndownService = new TurndownService();

turndownService.use(gfm);
patchIntrawordUnderscoreEscapes(turndownService);

type NodeWithSiblings = {
  nodeName?: string;
  nodeType?: number;
  previousSibling?: NodeWithSiblings | null;
  nextSibling?: NodeWithSiblings | null;
  textContent?: string | null;
};

const textNodeType = 3;
const leadingPunctuationOrWhitespace = /^[\p{P}\s]+/u;
const trailingPunctuationOrWhitespace = /[\p{P}\s]+$/u;
const wordCharacter = /[\p{L}\p{N}]/u;

function isStrongLike(node: NodeWithSiblings | null | undefined): boolean {
  if (!node?.nodeName) return false;
  const name = node.nodeName.toLowerCase();
  return name === "strong" || name === "b";
}

function isWordCharacter(value: string | null): boolean {
  if (!value) return false;
  return wordCharacter.test(value);
}

function patchIntrawordUnderscoreEscapes(service: TurndownService) {
  const originalEscape = service.escape.bind(service);

  service.escape = (content: string) =>
    originalEscape(content).replace(
      /(?<=[\p{L}\p{N}])\\_(?=[\p{L}\p{N}])/gu,
      "_",
    );
}

function getBoundaryCharacter(
  node: NodeWithSiblings,
  direction: "previousSibling" | "nextSibling",
): string | null {
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
    const previousBoundaryChar = getBoundaryCharacter(
      normalizedNode,
      "previousSibling",
    );
    const nextBoundaryChar = getBoundaryCharacter(
      normalizedNode,
      "nextSibling",
    );
    const previous = getMeaningfulSibling(normalizedNode, "previousSibling");
    const next = getMeaningfulSibling(normalizedNode, "nextSibling");

    const open = isStrongLike(previous) ? "" : delimiter;
    const close = isStrongLike(next) ? "" : delimiter;
    let before = "";
    let after = "";
    let emphasized = content;

    if (open && isWordCharacter(previousBoundaryChar)) {
      const leading =
        emphasized.match(leadingPunctuationOrWhitespace)?.[0] ?? "";
      if (leading) {
        before = leading;
        emphasized = emphasized.slice(leading.length);
      }
    }

    if (close && isWordCharacter(nextBoundaryChar)) {
      const trailing =
        emphasized.match(trailingPunctuationOrWhitespace)?.[0] ?? "";
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
    const el = node as unknown as { getAttribute(name: string): string | null };
    const src = el.getAttribute("src");
    if (!src) return "";
    const title = el.getAttribute("title") || src;
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
    const el = node as unknown as { getAttribute(name: string): string | null };
    const src = el.getAttribute("src");
    if (!src) return "";
    const alt = el.getAttribute("alt") || "";
    return `![${alt}](${handleFileUrl(src)})`;
  },
});

const htmlLoaders: MarkdownLoader[] = [
  stripInlineDataImagesLoader,
  multilang2Loader,
];
const markdownLoaders: MarkdownLoader[] = [
  intrawordUnderscoreLoader,
  mathjaxNotationLoader,
];

export function turndown(html: string) {
  const normalizedHtml = htmlLoaders.reduce(
    (content, loader) => loader(content),
    html,
  );
  const markdown = turndownService.turndown(normalizedHtml);
  const result = markdownLoaders.reduce(
    (content, loader) => loader(content),
    markdown,
  );
  return result;
}

export function htmlToPlainText(html: string) {
  const normalizedHtml = htmlLoaders.reduce(
    (content, loader) => loader(content),
    html,
  );

  return stripHTML(normalizedHtml).trim();
}

function stripInlineDataImagesLoader(content: string): string {
  return stripInlineDataImages(content);
}

function multilang2Loader(content: string): string {
  return selectMoodleLanguage(content, "en");
}

function intrawordUnderscoreLoader(content: string): string {
  return content.replace(/(?<=[\p{L}\p{N}])\\_(?=[\p{L}\p{N}])/gu, "_");
}

function mathjaxNotationLoader(content: string): string {
  const escapedBackslash = /\\\\\\\\/g;
  const normalize = (expression: string) =>
    expression.replace(escapedBackslash, "\\").trim();

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
