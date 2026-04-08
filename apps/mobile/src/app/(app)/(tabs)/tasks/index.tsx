import { FlashList } from "@shopify/flash-list";
import { Stack, router } from "expo-router";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { EmptyState } from "@/components/empty-state";
import { HeaderAccountButton } from "@/components/header-account-button";
import { InsetRow, NativePage, SymbolBadge, nativePageContentContainerStyle } from "@/components/native-ui";
import type { MobileTaskItem } from "@/lib/moodle-client";
import { useTasksQuery } from "@/lib/moodle-queries";

type TaskListItem = {
  id: string;
  task: MobileTaskItem;
  subdued: boolean;
};

export default function TasksScreen() {
  const tasksQuery = useTasksQuery();

  const { items, referenceNow } = useMemo(() => {
    const referenceNow = Date.now();
    const all = [
      ...(tasksQuery.data?.actionable ?? []),
      ...(tasksQuery.data?.review ?? []),
    ];

    const items: TaskListItem[] = all
      .filter((task) => !isExpiredIncompleteTask(task, referenceNow))
      .sort(compareByCompletionOrDueAt)
      .map((task) => ({
        id: task.id,
        task,
        subdued: task.completed === true,
      }));

    return { items, referenceNow };
  }, [tasksQuery.data]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Tasks",
          headerRight: () => <HeaderAccountButton />,
        }}
      />
      <NativePage>
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={nativePageContentContainerStyle}
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
          renderItem={({ item, index }) => (
            <TaskRow
              task={item.task}
              now={referenceNow}
              subdued={item.subdued}
              first={index === 0}
              last={index === items.length - 1}
            />
          )}
        />
      </NativePage>
    </>
  );
}

function TaskRow({
  task,
  now,
  subdued = false,
  first = false,
  last = false,
}: {
  task: MobileTaskItem;
  now: number;
  subdued?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  const status = formatTaskDueLabel(task, now);
  const kindTone = getKindTone(task.kind);
  const secondaryColor = platformColors.secondaryLabel;
  const tertiaryFill = platformColors.tertiarySystemFill;

  return (
    <InsetRow
      first={first}
      last={last}
      title={task.title}
      subtitle={[task.courseTitle, task.subtitle, status].filter(Boolean).join("  ·  ")}
      leading={<SymbolBadge symbol={kindTone.symbol} tint={kindTone.color} backgroundColor={kindTone.backgroundColor} />}
      accessory={
        <View style={[styles.taskPill, { backgroundColor: subdued ? tertiaryFill : kindTone.backgroundColor }]}>
          <Text selectable style={[styles.taskPillLabel, { color: subdued ? secondaryColor : kindTone.color }]}>
            {task.actionLabel ?? kindTone.label}
          </Text>
        </View>
      }
      onPress={() => router.push(task.route)}
    />
  );
}

function compareByCompletionOrDueAt(left: MobileTaskItem, right: MobileTaskItem) {
  const leftTimestamp = left.reviewAt ?? left.dueAt ?? left.closeAt ?? left.openAt ?? left.sortTimestamp;
  const rightTimestamp = right.reviewAt ?? right.dueAt ?? right.closeAt ?? right.openAt ?? right.sortTimestamp;

  if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp;
  if (left.courseTitle !== right.courseTitle) return left.courseTitle.localeCompare(right.courseTitle);
  return left.title.localeCompare(right.title);
}

function isExpiredIncompleteTask(task: MobileTaskItem, nowMs: number) {
  if (task.completed) return false;

  const now = Math.floor(nowMs / 1000);
  const submissionDeadline = task.closeAt ?? task.dueAt;
  if (!submissionDeadline) return false;

  return now > submissionDeadline;
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

const styles = {
  taskPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  taskPillLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700" as const,
  },
};
