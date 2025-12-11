import { gfm } from "@bwat47/turndown-plugin-gfm";
import TurndownService from "turndown";

type MarkdownLoader = (content: string) => string;

export const turndownService = new TurndownService();

turndownService.use(gfm);

turndownService.addRule("iframe", {
  filter: ["iframe"],
  replacement: (content, node) => {
    // @ts-expect-error no types
    const src = node.getAttribute("src");
    // @ts-expect-error no types
    const title = node.getAttribute("title") || src;
    return `[${title}](${src})`;
  },
});

const loaders: MarkdownLoader[] = [mathjaxNotationLoader];

const turndownCache = new Map<string, string>();

export function turndown(html: string) {
  if (turndownCache.has(html)) {
    return turndownCache.get(html)!;
  }
  const markdown = turndownService.turndown(html);
  const result = loaders.reduce((content, loader) => loader(content), markdown);
  turndownCache.set(html, result);
  return result;
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
