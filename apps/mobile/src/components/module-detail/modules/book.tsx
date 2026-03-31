import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { cleanMoodleHtml } from "@moodle/core";

import { MoodleHtml } from "@/components/moodle-html";

import { ReadableTextBlock, useRemoteModuleHtml } from "../shared";
import type { ModuleDetailProps } from "../types";

type BookChapter = {
  href: string;
  title: string;
};

export function BookDetail({ module }: Pick<ModuleDetailProps, "module">) {
  const tocContent = module.module.contents?.find((content) => content.filename === "structure");
  const chapters = parseBookChapters(tocContent?.content);
  const [selectedHref, setSelectedHref] = useState<string | null>(chapters[0]?.href ?? null);
  const selectedChapter = chapters.find((chapter) => chapter.href === selectedHref) ?? chapters[0] ?? null;
  const contentFile = selectedChapter
    ? module.module.contents?.find((content) => content.fileurl?.endsWith(selectedChapter.href))
    : undefined;
  const remoteHtml = useRemoteModuleHtml(contentFile);
  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;
  const fillColor = platformColors.tertiarySystemFill;
  const blueColor = platformColors.systemBlue;

  if (chapters.length === 0) {
    return (
      <ReadableTextBlock
        title="Book"
        content={
          remoteHtml.data ? (
            <MoodleHtml html={remoteHtml.data} baseUrl={contentFile?.fileurl} contents={module.module.contents} variant="secondary" />
          ) : undefined
        }
        isLoading={remoteHtml.isLoading}
        emptyCopy="Book chapters are only available in Moodle."
      />
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Text selectable style={{ fontSize: 19, fontWeight: "700", color: labelColor }}>
        Chapters
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {chapters.map((chapter, index) => {
          const selected = chapter.href === selectedChapter?.href;
          return (
            <Pressable
              key={chapter.href}
              onPress={() => setSelectedHref(chapter.href)}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderCurve: "continuous",
                backgroundColor: selected ? blueColor : fillColor,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                selectable
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: selected ? "#FFFFFF" : labelColor,
                }}
              >
                {index + 1}. {chapter.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ReadableTextBlock
        title={selectedChapter?.title ?? "Book"}
        content={
          remoteHtml.data ? (
            <MoodleHtml html={remoteHtml.data} baseUrl={contentFile?.fileurl} contents={module.module.contents} variant="secondary" />
          ) : undefined
        }
        isLoading={remoteHtml.isLoading}
        emptyCopy="This chapter opens in Moodle."
        subtle
      />
      {selectedChapter ? (
        <Text selectable style={{ fontSize: 13, lineHeight: 19, color: label2Color }}>
          The chapter body is fetched from Moodle when available. If it is missing here, open the module in Moodle.
        </Text>
      ) : null}
    </View>
  );
}

function parseBookChapters(content?: string): BookChapter[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as { href?: string; title?: string }[];
    return parsed
      .map((chapter) => ({
        href: chapter.href ?? "",
        title: cleanMoodleHtml(chapter.title ?? ""),
      }))
      .filter((chapter) => chapter.href && chapter.title);
  } catch {
    return [];
  }
}
