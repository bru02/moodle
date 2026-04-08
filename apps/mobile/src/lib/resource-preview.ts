type ResourcePreviewDetectionInput = {
  fileName?: string;
  url?: string;
  mimeType?: string;
};

export type NativeResourcePreviewKind = "ipynb" | "code" | null;
export const SUPPORTED_SHIKI_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "go",
  "html",
  "ini",
  "java",
  "javascript",
  "json",
  "jsx",
  "kotlin",
  "markdown",
  "php",
  "python",
  "r",
  "ruby",
  "rust",
  "scala",
  "sql",
  "swift",
  "toml",
  "tsx",
  "typescript",
  "xml",
  "yaml",
] as const;

export type SupportedShikiLanguage = (typeof SUPPORTED_SHIKI_LANGUAGES)[number];

const NOTEBOOK_MIME_TYPES = new Set([
  "application/x-ipynb+json",
  "application/ipynb+json",
]);

const CODE_MIME_TYPES = new Set([
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/x-python-code",
  "application/xml",
  "text/plain",
  "text/x-python",
  "text/x-java-source",
  "text/x-c",
  "text/x-c++",
  "text/x-csharp",
  "text/x-go",
  "text/x-rust",
  "text/x-swift",
  "text/x-kotlin",
  "text/x-shellscript",
  "text/x-sql",
  "text/javascript",
  "text/typescript",
  "text/json",
  "text/yaml",
  "text/markdown",
  "text/x-markdown",
]);

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".bash": "bash",
  ".c": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".css": "css",
  ".go": "go",
  ".h": "c",
  ".hpp": "cpp",
  ".html": "html",
  ".ini": "ini",
  ".java": "java",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "jsx",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".md": "markdown",
  ".php": "php",
  ".py": "python",
  ".r": "r",
  ".rb": "ruby",
  ".rs": "rust",
  ".scala": "scala",
  ".sh": "bash",
  ".sql": "sql",
  ".swift": "swift",
  ".toml": "toml",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".txt": "text",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".zsh": "bash",
};

const SHIKI_LANGUAGE_SET = new Set<string>(SUPPORTED_SHIKI_LANGUAGES);

const SHIKI_LANGUAGE_ALIASES: Record<string, SupportedShikiLanguage> = {
  "c#": "csharp",
  "c++": "cpp",
  cs: "csharp",
  htm: "html",
  ipython: "python",
  js: "javascript",
  md: "markdown",
  node: "javascript",
  py: "python",
  py3: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  yml: "yaml",
  zsh: "bash",
};

export function detectNativeResourcePreviewKind(input: ResourcePreviewDetectionInput): NativeResourcePreviewKind {
  const extension = getFileExtension(input.fileName, input.url);
  const normalizedMime = input.mimeType?.trim().toLowerCase();

  if (extension === ".ipynb" || (normalizedMime && NOTEBOOK_MIME_TYPES.has(normalizedMime))) {
    return "ipynb";
  }

  if (extension && EXTENSION_TO_LANGUAGE[extension]) {
    return "code";
  }

  if (normalizedMime && (normalizedMime.startsWith("text/") || CODE_MIME_TYPES.has(normalizedMime))) {
    return "code";
  }

  return null;
}

export function inferCodeLanguage(input: ResourcePreviewDetectionInput) {
  const extension = getFileExtension(input.fileName, input.url);
  if (extension) {
    const mapped = EXTENSION_TO_LANGUAGE[extension];
    if (mapped) {
      return mapped;
    }
  }

  const normalizedMime = input.mimeType?.trim().toLowerCase();
  if (!normalizedMime) {
    return "text";
  }

  if (normalizedMime.includes("json")) return "json";
  if (normalizedMime.includes("javascript")) return "javascript";
  if (normalizedMime.includes("typescript")) return "typescript";
  if (normalizedMime.includes("yaml")) return "yaml";
  if (normalizedMime.includes("xml")) return "xml";
  if (normalizedMime.includes("markdown")) return "markdown";

  return "text";
}

export function normalizeShikiLanguage(language: string): SupportedShikiLanguage | null {
  const normalizedLanguage = language.trim().toLowerCase();
  const resolvedLanguage = SHIKI_LANGUAGE_ALIASES[normalizedLanguage] ?? normalizedLanguage;

  if (!SHIKI_LANGUAGE_SET.has(resolvedLanguage)) {
    return null;
  }

  return resolvedLanguage as SupportedShikiLanguage;
}

export function getFileExtension(fileName: string | undefined, url?: string) {
  const fileNameExtension = extractExtension(fileName);
  if (fileNameExtension) {
    return fileNameExtension;
  }

  if (!url) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);
    return extractExtension(parsedUrl.pathname) ?? "";
  } catch {
    return "";
  }
}

function extractExtension(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.split("?")[0]?.split("#")[0] ?? value;
  const match = normalizedValue.match(/(\.[A-Za-z0-9_-]+)$/);
  return match?.[1]?.toLowerCase();
}
