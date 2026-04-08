import { Stack, useLocalSearchParams } from "expo-router";
import { startTransition, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View, useColorScheme } from "react-native";
import { createHighlighter, createJavaScriptRegexEngine } from "shiki";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { createNativeEngine, isNativeEngineAvailable } from "react-native-shiki-engine";

import { EmptyState } from "@/components/empty-state";
import { NativeScrollPage } from "@/components/native-ui";
import { platformColors } from "@/constants/platform-colors";
import { openExternalUrl } from "@/lib/browser";
import {
  detectNativeResourcePreviewKind,
  inferCodeLanguage,
  normalizeShikiLanguage,
  type SupportedShikiLanguage,
} from "@/lib/resource-preview";

type NotebookCell =
  | { id: string; type: "markdown"; source: string }
  | { id: string; type: "code"; source: string; language: string };

type HighlightToken = {
  content: string;
  color?: string;
  fontStyle?: number;
};

type HighlighterRuntime = {
  promise: Promise<ShikiHighlighter> | null;
  loadedLanguages: Set<SupportedShikiLanguage>;
  loadingLanguages: Map<SupportedShikiLanguage, Promise<void>>;
};

const SHIKI_THEME_LIGHT = "github-light";
const SHIKI_THEME_DARK = "github-dark";
const SHIKI_MAX_HIGHLIGHT_CHARACTERS = 20_000;
const SHIKI_MAX_HIGHLIGHT_LINES = 400;
const SHIKI_RESULT_CACHE_LIMIT = 32;
const CODE_FONT_FAMILY = "FiraCode_400Regular";
const CODE_FONT_FAMILY_BOLD = "FiraCode_700Bold";

type ShikiHighlighter = Awaited<ReturnType<typeof createHighlighter>>;
const nativeHighlighterRuntime: HighlighterRuntime = {
  promise: null,
  loadedLanguages: new Set(),
  loadingLanguages: new Map(),
};
const javaScriptHighlighterRuntime: HighlighterRuntime = {
  promise: null,
  loadedLanguages: new Set(),
  loadingLanguages: new Map(),
};
const highlightCache = new Map<string, HighlightToken[][]>();

export function ResourcePreviewScreen() {
  const params = useLocalSearchParams<{ uri?: string; fileName?: string; mimeType?: string }>();
  const uri = typeof params.uri === "string" ? params.uri : "";
  const fileName = typeof params.fileName === "string" ? params.fileName : "";
  const mimeType = typeof params.mimeType === "string" ? params.mimeType : "";
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlightedLines, setHighlightedLines] = useState<HighlightToken[][] | null>(null);
  const [highlightedNotebook, setHighlightedNotebook] = useState<Record<string, HighlightToken[][]>>({});

  const previewKind = useMemo(
    () => detectNativeResourcePreviewKind({ fileName, mimeType }),
    [fileName, mimeType],
  );
  const inferredLanguage = useMemo(
    () => inferCodeLanguage({ fileName, mimeType }),
    [fileName, mimeType],
  );
  const preloadLanguage = useMemo(
    () => normalizeShikiLanguage(inferredLanguage),
    [inferredLanguage],
  );

  useEffect(() => {
    let cancelled = false;

    setTextContent(null);
    setLoadError(null);
    setHighlightedLines(null);
    setHighlightedNotebook({});

    if (!uri) {
      setLoadError("Missing file URI.");
      return;
    }

    if (preloadLanguage) {
      void preloadShikiLanguage(preloadLanguage);
    }

    void (async () => {
      try {
        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`Failed to load file (${response.status}).`);
        }

        const text = await response.text();
        if (!cancelled) {
          setTextContent(text);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load preview content.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [preloadLanguage, uri]);

  const notebookCells = useMemo(() => {
    if (previewKind !== "ipynb" || !textContent) {
      return [] as NotebookCell[];
    }

    return parseNotebookCells(textContent, inferCodeLanguage({ fileName, mimeType }));
  }, [fileName, mimeType, previewKind, textContent]);

  useEffect(() => {
    let cancelled = false;

    if (!textContent || previewKind !== "code") {
      return;
    }

    void (async () => {
      const lines = await highlightCode(textContent, inferredLanguage, isDark);
      if (!cancelled) {
        startTransition(() => {
          setHighlightedLines(lines);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inferredLanguage, isDark, previewKind, textContent]);

  useEffect(() => {
    let cancelled = false;

    if (previewKind !== "ipynb" || notebookCells.length === 0) {
      return;
    }

    void (async () => {
      const highlightedEntries = await Promise.all(
        notebookCells
          .filter((cell) => cell.type === "code")
          .map(async (cell) => {
            const lines = await highlightCode(cell.source, cell.language, isDark);
            return [cell.id, lines] as const;
          }),
      );

      if (!cancelled) {
        startTransition(() => {
          setHighlightedNotebook(Object.fromEntries(highlightedEntries));
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDark, notebookCells, previewKind]);

  if (!uri) {
    return <EmptyState title="Preview unavailable" description="Missing preview file URL." />;
  }

  if (loadError) {
    return <EmptyState title="Preview unavailable" description={loadError} />;
  }

  if (!textContent) {
    return <EmptyState title="Loading preview" description="Fetching file contents." />;
  }

  if (previewKind === "ipynb") {
    return (
      <NativeScrollPage>
        <Stack.Screen options={{ title: fileName || "Notebook" }} />
        <View style={{ gap: 12 }}>
          {notebookCells.length === 0 ? <EmptyState title="Notebook is empty" description="No cells to render." /> : null}
          {notebookCells.map((cell, index) => (
            <View
              key={cell.id}
              style={{
                borderRadius: 14,
                borderCurve: "continuous",
                backgroundColor: platformColors.secondarySystemGroupedBackground,
                padding: 12,
                gap: 8,
              }}
            >
              <Text selectable style={{ fontSize: 12, fontWeight: "700", color: platformColors.secondaryLabel }}>
                {cell.type === "markdown" ? `Markdown ${index + 1}` : `${cell.language} ${index + 1}`}
              </Text>
              {cell.type === "markdown" ? (
                <EnrichedMarkdownText
                  markdown={cell.source}
                  flavor="github"
                  onLinkPress={({ url }) => {
                    void openExternalUrl(url);
                  }}
                  markdownStyle={createMarkdownStyle(CODE_FONT_FAMILY)}
                />
              ) : (
                <CodeBlock lines={highlightedNotebook[cell.id]} fallback={cell.source} fontFamily={CODE_FONT_FAMILY} />
              )}
            </View>
          ))}
        </View>
      </NativeScrollPage>
    );
  }

  return (
    <NativeScrollPage>
      <Stack.Screen options={{ title: fileName || "Code" }} />
      <View style={{ gap: 12 }}>
        <CodeBlock lines={highlightedLines} fallback={textContent} fontFamily={CODE_FONT_FAMILY} />
      </View>
    </NativeScrollPage>
  );
}

function CodeBlock({
  lines,
  fallback,
  fontFamily,
}: {
  lines: HighlightToken[][] | null | undefined;
  fallback: string;
  fontFamily: string;
}) {
  const backgroundColor = "rgba(120,120,128,0.12)";
  const textColor = platformColors.label;

  return (
    <ScrollView horizontal style={{ borderRadius: 12, borderCurve: "continuous", backgroundColor }} contentContainerStyle={{ padding: 12 }}>
      {lines ? (
        <Text selectable style={{ fontFamily, fontSize: 13, lineHeight: 20, color: textColor }}>
          {lines.map((line, lineIndex) => (
            <Text key={`line-${lineIndex}`}>
              {line.map((token, tokenIndex) => (
                <Text
                  key={`token-${lineIndex}-${tokenIndex}`}
                  style={{
                    color: token.color ?? textColor,
                    fontFamily: token.fontStyle && (token.fontStyle & 2) ? CODE_FONT_FAMILY_BOLD : fontFamily,
                    fontStyle: token.fontStyle && (token.fontStyle & 1) ? "italic" : "normal",
                    textDecorationLine: token.fontStyle && (token.fontStyle & 4) ? "underline" : "none",
                  }}
                >
                  {token.content}
                </Text>
              ))}
              {lineIndex < lines.length - 1 ? "\n" : ""}
            </Text>
          ))}
        </Text>
      ) : (
        <Text selectable style={{ fontFamily, fontSize: 13, lineHeight: 20, color: textColor }}>
          {fallback}
        </Text>
      )}
    </ScrollView>
  );
}

async function highlightCode(code: string, language: string, isDark: boolean): Promise<HighlightToken[][]> {
  if (shouldSkipHighlighting(code)) {
    return code.split("\n").map((line) => [{ content: line }]);
  }

  const normalizedLanguage = normalizeShikiLanguage(language);
  if (!normalizedLanguage) {
    return code.split("\n").map((line) => [{ content: line }]);
  }

  const theme = isDark ? SHIKI_THEME_DARK : SHIKI_THEME_LIGHT;
  const runtime = getHighlighterRuntime(normalizedLanguage);
  const cacheKey = `${getRuntimeCacheKey(runtime)}::${theme}::${normalizedLanguage}::${code}`;
  const cached = highlightCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const highlighter = await preloadShikiLanguage(normalizedLanguage);

    const tokens = highlighter.codeToTokensBase(code, {
      lang: normalizedLanguage as never,
      theme,
    }) as HighlightToken[][];

    setHighlightCache(cacheKey, tokens);
    return tokens;
  } catch {
    return code.split("\n").map((line) => [{ content: line }]);
  }
}

function parseNotebookCells(rawNotebook: string, fallbackLanguage: string): NotebookCell[] {
  try {
    const parsed = JSON.parse(rawNotebook) as {
      metadata?: { language_info?: { name?: string } };
      cells?: Array<{ id?: string; cell_type?: string; source?: string | string[]; metadata?: { language?: string } }>;
    };

    const notebookLanguage =
      parsed.metadata?.language_info?.name && typeof parsed.metadata.language_info.name === "string"
        ? parsed.metadata.language_info.name
        : fallbackLanguage;

    return (parsed.cells ?? [])
      .map((cell, index) => {
        const source = normalizeNotebookSource(cell.source);
        if (!source.trim()) {
          return null;
        }

        if (cell.cell_type === "markdown") {
          return {
            id: cell.id ?? `markdown-${index}`,
            type: "markdown" as const,
            source,
          };
        }

        const language =
          typeof cell.metadata?.language === "string" && cell.metadata.language.length > 0
            ? cell.metadata.language
            : notebookLanguage;

        return {
          id: cell.id ?? `code-${index}`,
          type: "code" as const,
          source,
          language,
        };
      })
      .filter((cell): cell is NotebookCell => Boolean(cell));
  } catch {
    return [];
  }
}

function normalizeNotebookSource(source: string | string[] | undefined) {
  if (Array.isArray(source)) {
    return source.join("");
  }

  return typeof source === "string" ? source : "";
}

function getHighlighterRuntime(language: SupportedShikiLanguage) {
  if (language === "typescript" || language === "tsx") {
    return javaScriptHighlighterRuntime;
  }

  return nativeHighlighterRuntime;
}

function getRuntimeCacheKey(runtime: HighlighterRuntime) {
  return runtime === javaScriptHighlighterRuntime ? "js" : "native";
}

async function getRuntimeHighlighter(runtime: HighlighterRuntime) {
  if (!runtime.promise) {
    runtime.promise = createHighlighter({
      themes: [SHIKI_THEME_LIGHT, SHIKI_THEME_DARK],
      langs: [],
      engine:
        runtime === javaScriptHighlighterRuntime
          ? createJavaScriptRegexEngine()
          : isNativeEngineAvailable()
            ? createNativeEngine({ maxCacheSize: 2000 })
            : createJavaScriptRegexEngine(),
    });
  }

  return await runtime.promise;
}

async function preloadShikiLanguage(language: SupportedShikiLanguage) {
  const runtime = getHighlighterRuntime(language);
  const highlighter = await getRuntimeHighlighter(runtime);
  await ensureShikiLanguage(runtime, highlighter, language);
  return highlighter;
}

async function ensureShikiLanguage(
  runtime: HighlighterRuntime,
  highlighter: ShikiHighlighter,
  language: SupportedShikiLanguage,
) {
  if (runtime.loadedLanguages.has(language)) {
    return;
  }

  const existingLoad = runtime.loadingLanguages.get(language);
  if (existingLoad) {
    await existingLoad;
    return;
  }

  const loadPromise = highlighter
    .loadLanguage(language as never)
    .then(() => {
      runtime.loadedLanguages.add(language);
    })
    .finally(() => {
      runtime.loadingLanguages.delete(language);
    });

  runtime.loadingLanguages.set(language, loadPromise);
  await loadPromise;
}

function shouldSkipHighlighting(code: string) {
  if (code.length > SHIKI_MAX_HIGHLIGHT_CHARACTERS) {
    return true;
  }

  return countLines(code) > SHIKI_MAX_HIGHLIGHT_LINES;
}

function countLines(code: string) {
  let lines = 1;
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === "\n") {
      lines += 1;
    }
  }

  return lines;
}

function setHighlightCache(cacheKey: string, tokens: HighlightToken[][]) {
  if (highlightCache.has(cacheKey)) {
    highlightCache.delete(cacheKey);
  }

  highlightCache.set(cacheKey, tokens);

  if (highlightCache.size <= SHIKI_RESULT_CACHE_LIMIT) {
    return;
  }

  const oldestKey = highlightCache.keys().next().value;
  if (oldestKey) {
    highlightCache.delete(oldestKey);
  }
}

function createMarkdownStyle(fontFamily: string) {
  return {
    paragraph: {
      fontSize: 15,
      lineHeight: 22,
      color: String(platformColors.label),
    },
    code: {
      fontFamily,
      fontSize: 13,
      backgroundColor: "rgba(120,120,128,0.12)",
      color: String(platformColors.label),
    },
    codeBlock: {
      fontFamily,
      fontSize: 13,
      lineHeight: 20,
      backgroundColor: "rgba(120,120,128,0.12)",
      borderRadius: 10,
      padding: 10,
      color: String(platformColors.label),
    },
    link: {
      color: String(platformColors.systemBlue),
      underline: false,
    },
  };
}
