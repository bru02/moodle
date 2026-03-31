import { FlashList } from "@shopify/flash-list";
import { Stack, router } from "expo-router";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { EmptyState } from "@/components/empty-state";
import { HeaderAccountButton } from "@/components/header-account-button";
import { GroupHeader, InsetGroup, InsetRow, NativePage, SymbolBadge, nativePageContentContainerStyle } from "@/components/native-ui";
import type { MobileTaskItem } from "@/lib/moodle-client";
import { useTasksQuery } from "@/lib/moodle-queries";

type TaskListItem =
  | {
      kind: "section";
      id: string;
      title: string;
      subtitle: string;
      count: number;
    }
  | {
      kind: "task";
      id: string;
      task: MobileTaskItem;
      subdued?: boolean;
      now: number;
    };

export default function TasksScreen() {
  const tasksQuery = useTasksQuery();
  const now = Date.now();

  const { items } = useMemo(() => {
    const actionable = [...(tasksQuery.data?.actionable ?? [])].sort(compareByUrgency);
    const review = [...(tasksQuery.data?.review ?? [])].sort(
      (left, right) => right.sortTimestamp - left.sortTimestamp,
    );
    const items: TaskListItem[] = [];

    if (actionable.length > 0) {
      items.push({
        kind: "section",
        id: "actionable",
        title: "Due next",
        subtitle: "",
        count: actionable.length,
      });
      for (const task of actionable) {
        items.push({ kind: "task", id: task.id, task, now });
      }
    }

    if (review.length > 0) {
      items.push({
        kind: "section",
        id: "review",
        title: "Recent activity",
        subtitle: "",
        count: review.length,
      });
      for (const task of review) {
        items.push({ kind: "task", id: `review:${task.id}`, task, subdued: true, now });
      }
    }

    return {
      items,
    };
  }, [now, tasksQuery.data]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Tasks",
          headerLargeTitle: false,
          headerTitleAlign: "center",
          headerRight: () => <HeaderAccountButton />,
        }}
      />
      <NativePage>
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={nativePageContentContainerStyle}
          ItemSeparatorComponent={TaskListSpacer}
          ListEmptyComponent={
            tasksQuery.isLoading ? (
              <EmptyState
                title="Loading tasks"
                description="Loading your tasks."
              />
            ) : (
              <EmptyState
                title="Nothing on deck"
                description="No upcoming deadlines."
              />
            )
          }
          getItemType={(item) => item.kind}
          renderItem={({ item }) =>
            item.kind === "section" ? (
              <GroupHeader
                title={item.title}
                subtitle={item.subtitle}
                trailing={<TaskCount count={item.count} />}
              />
            ) : (
              <InsetGroup>
                <TaskRow task={item.task} now={item.now} subdued={item.subdued} />
              </InsetGroup>
            )
          }
        />
      </NativePage>
    </>
  );
}

function TaskListSpacer() {
  return <View style={{ height: 12 }} />;
}

function TaskRow({
  task,
  now,
  subdued = false,
}: {
  task: MobileTaskItem;
  now: number;
  subdued?: boolean;
}) {
  const status = formatTaskDueLabel(task, now);
  const kindTone = getKindTone(task.kind);
  const secondaryColor = platformColors.secondaryLabel;
  const tertiaryFill = platformColors.tertiarySystemFill;

  return (
    <InsetRow
      first
      last
      title={task.title}
      subtitle={[task.courseTitle, task.subtitle, status].filter(Boolean).join("  ·  ")}
      leading={<SymbolBadge symbol={kindTone.symbol} tint={kindTone.color} backgroundColor={kindTone.backgroundColor} />}
      accessory={
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 4,
            backgroundColor: subdued ? tertiaryFill : kindTone.backgroundColor,
          }}
        >
          <Text selectable style={{ fontSize: 11, lineHeight: 14, fontWeight: "700", color: subdued ? secondaryColor : kindTone.color }}>
            {task.actionLabel ?? kindTone.label}
          </Text>
        </View>
      }
      onPress={() => router.push(task.route)}
    />
  );
}

function TaskCount({ count }: { count: number }) {
  const secondaryColor = platformColors.secondaryLabel;

  return (
    <Text selectable style={{ fontSize: 13, fontWeight: "700", color: secondaryColor }}>
      {count}
    </Text>
  );
}

function compareByUrgency(left: MobileTaskItem, right: MobileTaskItem) {
  if (left.sortTimestamp !== right.sortTimestamp) return left.sortTimestamp - right.sortTimestamp;
  return right.sortTimestamp - left.sortTimestamp;
}

const shortDateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

const shortTimeFormatter = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
});

function formatTaskDueLabel(task: MobileTaskItem, now: number) {
  const timestamp = task.closeAt ?? task.dueAt ?? task.reviewAt ?? task.openAt;
  if (!timestamp) {
    return task.completed ? "Completed" : "No deadline";
  }

  const dueAt = timestamp * 1000;
  const delta = dueAt - now;
  const day = 24 * 60 * 60 * 1000;

  if (task.completed) return `Completed ${formatRelativeDate(dueAt)}`;
  if (delta < 0) return `Overdue ${formatRelativeDate(dueAt)}`;
  if (delta < day) return `Due today ${formatTime(dueAt)}`;
  if (delta < 2 * day) return `Due tomorrow ${formatTime(dueAt)}`;
  return `Due ${formatRelativeDate(dueAt)} ${formatTime(dueAt)}`;
}

function formatRelativeDate(value: number) {
  return shortDateFormatter.format(new Date(value));
}

function formatTime(value: number) {
  return shortTimeFormatter.format(new Date(value));
}

function getKindTone(kind: MobileTaskItem["kind"]) {
  switch (kind) {
    case "assignment":
      return {
        label: "Assignment",
        symbol: "doc.text",
        backgroundColor: "rgba(0,122,255,0.12)",
        color: "#007AFF",
      };
    case "quiz":
      return {
        label: "Quiz",
        symbol: "questionmark.circle",
        backgroundColor: "rgba(255,149,0,0.12)",
        color: "#FF9500",
      };
    case "attendance":
      return {
        label: "Attendance",
        symbol: "checkmark.circle",
        backgroundColor: "rgba(52,199,89,0.12)",
        color: "#34C759",
      };
    default:
      return {
        label: "Module",
        symbol: "square.grid.2x2",
        backgroundColor: "rgba(142,142,147,0.12)",
        color: "#8E8E93",
      };
  }
}
