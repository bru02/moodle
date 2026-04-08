import React from "react";
import { Pressable, Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import type { TaskItem } from "@moodle/core";

const taskDateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatTimestamp(value?: number) {
  if (!value) return null;
  return taskDateFormatter.format(new Date(value * 1000));
}

function kindColor(kind: string): string {
  if (kind === "assignment") return "#007AFF";
  if (kind === "quiz") return "#FF9500";
  if (kind === "forum") return "#34C759";
  return "#8E8E93";
}

export function TaskCard({ task, onPress }: { task: TaskItem; onPress?: () => void }) {
  const primaryDate = formatTimestamp(task.closeAt ?? task.dueAt ?? task.openAt ?? task.reviewAt);
  const accent = kindColor(task.kind);

  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;

  const inner = (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        padding: 18,
        gap: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <Text selectable style={{ flex: 1, fontSize: 16, fontWeight: "700", color: labelColor }}>
          {task.title}
        </Text>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: `${accent}20`,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: accent }}>
            {task.kind}
          </Text>
        </View>
      </View>
      <Text selectable style={{ fontSize: 14, color: label2Color }}>
        {task.courseTitle}
        {task.subtitle ? ` · ${task.subtitle}` : ""}
      </Text>
      {primaryDate ? (
        <Text selectable style={{ fontSize: 13, fontWeight: "600", color: accent }}>
          {primaryDate}
        </Text>
      ) : null}
    </Pressable>
  );

  const outerStyle = {
    borderRadius: 16,
    borderCurve: "continuous" as const,
    overflow: "hidden" as const,
  };

  if (process.env.EXPO_OS === "ios") {
    if (isLiquidGlassAvailable()) {
      return (
        <View>
          <GlassView style={outerStyle}>{inner}</GlassView>
        </View>
      );
    }
    return (
      <View>
        <BlurView tint="systemMaterial" intensity={80} style={outerStyle}>{inner}</BlurView>
      </View>
    );
  }

  return (
    <View>
      <View style={[outerStyle, { backgroundColor: "rgba(255,255,255,0.95)" }]}>
        {inner}
      </View>
    </View>
  );
}
