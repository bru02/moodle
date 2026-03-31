import { Stack, useLocalSearchParams, router } from "expo-router";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";
import { Button, Host } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, tint } from "@expo/ui/swift-ui/modifiers";

import { EmptyState } from "@/components/empty-state";
import { GroupHeader, InsetGroup, NativeScrollPage, SectionTitle, StatPill, SymbolBadge } from "@/components/native-ui";
import { useTasksQuery } from "@/lib/moodle-queries";

export default function TaskDetailScreen() {
  const params = useLocalSearchParams<{ taskId?: string }>();
  const taskId = typeof params.taskId === "string" ? params.taskId : "";
  const tasksQuery = useTasksQuery();
  const task = useMemo(
    () =>
      tasksQuery.data?.actionable.find((item) => item.id === taskId) ??
      tasksQuery.data?.review.find((item) => item.id === taskId) ??
      null,
    [taskId, tasksQuery.data],
  );

  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;
  const blueColor = platformColors.systemBlue;

  if (tasksQuery.isLoading && !task) {
    return <EmptyState title="Loading task" />;
  }

  if (!task) {
    return <EmptyState title="Task not found" description="This task is no longer available." />;
  }

  return (
    <>
      <Stack.Screen options={{ title: task.title }} />
      <NativeScrollPage>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
          <SymbolBadge symbol={symbolForTask(task.kind)} />
          <View style={{ flex: 1, gap: 8 }}>
            <SectionTitle eyebrow={task.kind} title={task.title} subtitle={task.courseTitle} />
            {task.detail ? (
              <Text selectable style={{ fontSize: 15, lineHeight: 21, color: label2Color }}>
                {task.detail}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          <StatPill label="Status" value={task.completed ? "Completed" : "Open"} tint={labelColor} />
          <StatPill label="Action" value={task.actionLabel ?? "Open item"} tint={blueColor} />
        </View>

        <InsetGroup>
          <GroupHeader title="Open task" />
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Host style={{ width: "100%" }}>
              <Button
                label="Open item"
                onPress={() => router.push(task.route)}
                modifiers={[buttonStyle("borderedProminent"), controlSize("large"), tint(blueColor)]}
              />
            </Host>
          </View>
        </InsetGroup>
      </NativeScrollPage>
    </>
  );
}

function symbolForTask(kind: string) {
  switch (kind) {
    case "assignment":
      return "doc.text";
    case "quiz":
      return "questionmark.circle";
    case "attendance":
      return "checkmark.circle";
    default:
      return "square.grid.2x2";
  }
}
