import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import PagerView from "react-native-pager-view";

import { platformColors } from "@/constants/platform-colors";

import type { CoreCourseModuleContentFile } from "@moodle/core";
import { extractBookChapterId, handleMoodleFileUrl, parseBookToc, resolveBookChapterContentFile } from "@moodle/core";

import { MoodleHtml } from "@/components/moodle-html";
import { useAppState } from "@/providers/app-provider";

import { ReadableTextBlock, useRemoteModuleHtml } from "../shared";
import type { ModuleDetailProps } from "../types";

type BookChapter = {
  href: string;
  title: string;
};

type BookChapterProgress = {
  href: string;
  wasLatest: boolean;
};

const BOOK_CHAPTER_PROGRESS_KEY = "moodle.mobile.book.chapter-progress";
const BOOK_PAGER_HEIGHT = 560;

export function BookDetail({ scope, module }: Pick<ModuleDetailProps, "scope" | "module">) {
  const tocContent = module.module.contents?.find((content) => content.filename === "structure");
  const chapters = useMemo(() => parseBookToc(tocContent?.content), [tocContent?.content]);
  const latestIndex = Math.max(chapters.length - 1, 0);
  const pagerRef = useRef<PagerView>(null);
  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;
  const fillColor = platformColors.tertiarySystemFill;
  const blueColor = platformColors.systemBlue;

  const [selectedIndex, setSelectedIndex] = useState(latestIndex);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (chapters.length === 0) {
        if (!cancelled) {
          setSelectedIndex(0);
        }
        return;
      }

      const progress = await readBookChapterProgress(scope.id, module.module.id);
      if (cancelled) {
        return;
      }

      let nextIndex = latestIndex;
      if (progress && !progress.wasLatest) {
        const persistedIndex = chapters.findIndex((chapter) => chapter.href === progress.href);
        nextIndex = persistedIndex >= 0 ? persistedIndex : latestIndex;
      }

      setSelectedIndex(nextIndex);
      setTimeout(() => {
        pagerRef.current?.setPageWithoutAnimation(nextIndex);
      }, 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [chapters, latestIndex, module.module.id, scope.id]);

  useEffect(() => {
    const chapter = chapters[selectedIndex];
    if (!chapter) {
      return;
    }

    void writeBookChapterProgress(scope.id, module.module.id, {
      href: chapter.href,
      wasLatest: selectedIndex === chapters.length - 1,
    });
  }, [chapters, module.module.id, scope.id, selectedIndex]);

  const goToChapter = (index: number) => {
    const clampedIndex = Math.min(Math.max(index, 0), chapters.length - 1);
    setSelectedIndex(clampedIndex);
    pagerRef.current?.setPage(clampedIndex);
  };

  if (chapters.length === 0) {
    return <ReadableTextBlock title="Book" emptyCopy="Book chapters are only available in Moodle." />;
  }

  return (
    <View style={{ gap: 12 }}>
      <Text selectable style={{ fontSize: 19, fontWeight: "700", color: labelColor }}>
        Chapter {selectedIndex + 1} of {chapters.length}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {chapters.map((chapter, index) => {
          const selected = index === selectedIndex;
          return (
            <Pressable
              key={chapter.href}
              accessibilityRole="button"
              accessibilityLabel={`Go to chapter ${index + 1}: ${chapter.title}`}
              onPress={() => goToChapter(index)}
              style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.74 : 1 })}
            >
              <View
                style={{
                  height: 5,
                  borderRadius: 999,
                  borderCurve: "continuous",
                  backgroundColor: selected ? blueColor : fillColor,
                }}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={{ height: BOOK_PAGER_HEIGHT }}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1, width: "100%" }}
          initialPage={selectedIndex}
          overdrag
          onPageSelected={(event) => {
            const nextIndex = event.nativeEvent.position;
            if (nextIndex !== selectedIndex) {
              setSelectedIndex(nextIndex);
            }
          }}
        >
          {chapters.map((chapter) => (
            <View key={chapter.href} collapsable={false} style={{ flex: 1 }}>
              <BookChapterSlide chapter={chapter} moduleContents={module.module.contents} moduleUrl={module.module.url} />
            </View>
          ))}
        </PagerView>
      </View>

      <Text selectable style={{ fontSize: 13, lineHeight: 19, color: label2Color }}>
        Swipe between chapters. Left-edge swipe still goes back.
      </Text>
    </View>
  );
}

function BookChapterSlide({
  chapter,
  moduleContents,
  moduleUrl,
}: {
  chapter: BookChapter;
  moduleContents: CoreCourseModuleContentFile[] | undefined;
  moduleUrl?: string;
}) {
  const contentFile = resolveBookChapterContentFile(moduleContents, chapter.href);
  const remoteHtml = useRemoteModuleHtml(contentFile);
  const chapterFallbackHtml = useBookChapterFallbackHtml({ chapterHref: chapter.href, moduleUrl, enabled: !contentFile });
  const html = remoteHtml.data || chapterFallbackHtml.data;

  return (
    <ScrollView contentInsetAdjustmentBehavior="never" style={{ flex: 1 }}>
      <ReadableTextBlock
        title={chapter.title}
        content={html ? <MoodleHtml html={html} baseUrl={contentFile?.fileurl ?? moduleUrl} contents={moduleContents} variant="secondary" /> : undefined}
        isLoading={remoteHtml.isLoading || chapterFallbackHtml.isLoading}
        emptyCopy="This chapter opens in Moodle."
        subtle
      />
    </ScrollView>
  );
}

function useBookChapterFallbackHtml({
  chapterHref,
  moduleUrl,
  enabled,
}: {
  chapterHref: string;
  moduleUrl?: string;
  enabled: boolean;
}) {
  const { activeAccount, accountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const chapterId = extractBookChapterId(chapterHref);

  return useQuery({
    queryKey: ["moodle", "module-book-chapter-fallback", activeAccount?.id, moduleUrl, chapterId],
    enabled: Boolean(enabled && moduleUrl && chapterId && session),
    queryFn: async () => {
      if (!moduleUrl || !chapterId || !session) {
        return "";
      }

      const chapterUrl = new URL(moduleUrl);
      chapterUrl.searchParams.set("chapterid", chapterId);

      const response = await fetch(
        handleMoodleFileUrl({
          url: chapterUrl.toString(),
          accessKey: session.accessKey,
          siteOrigin: activeAccount?.origin,
        }),
      );

      return await response.text();
    },
  });
}

async function readBookChapterProgress(scopeId: string, moduleId: string | number): Promise<BookChapterProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(getBookChapterProgressKey(scopeId, moduleId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<BookChapterProgress>;
    if (!parsed.href) {
      return null;
    }

    return {
      href: parsed.href,
      wasLatest: parsed.wasLatest === true,
    };
  } catch {
    return null;
  }
}

async function writeBookChapterProgress(scopeId: string, moduleId: string | number, progress: BookChapterProgress) {
  try {
    await AsyncStorage.setItem(getBookChapterProgressKey(scopeId, moduleId), JSON.stringify(progress));
  } catch {
    // Ignore persistence errors for chapter progress.
  }
}

function getBookChapterProgressKey(scopeId: string, moduleId: string | number) {
  return `${BOOK_CHAPTER_PROGRESS_KEY}.${scopeId}.${String(moduleId)}`;
}
