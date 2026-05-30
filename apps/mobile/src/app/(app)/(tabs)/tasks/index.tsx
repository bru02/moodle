import { FlashList } from "@shopify/flash-list";
import SegmentedControl from "@expo/ui/community/segmented-control";
import { Stack, router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";


import { EmptyState } from "@/components/empty-state";
import { HeaderAccountButton } from "@/components/header-account-button";
import { LoadingState } from "@/components/loading-state";
import { InsetRow, NativePage, SymbolBadge, nativePageContentContainerStyle } from "@/components/native-ui";
import type { MobileTaskItem } from "@/lib/moodle-client";
import { useTasksQuery } from "@/lib/moodle-queries";
import { markTaskReviewSeen, readTaskReviewState, writeTaskReviewState, type TaskReviewState } from "@/lib/task-review-state";
import { useAppState } from "@/providers/app-provider";

type TaskListItem = {
  id: string;
  task: MobileTaskItem;
  badge?: string;
};

type TaskTabId = "due" | "grades";

const TASK_TAB_IDS: readonly TaskTabId[] = ["due", "grades"];

export default function TasksScreen() {
  const { activeAccount } = useAppState();
  const tasksQuery = useTasksQuery();
  const [selectedTab, setSelectedTab] = useState<TaskTabId>("due");
  const [reviewState, setReviewState] = useState<TaskReviewState | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!activeAccount) {
      setReviewState(null);
      return;
    }

    void readTaskReviewState(activeAccount.id).then((state) => {
      if (!cancelled) setReviewState(state);
    });

    return () => {
      cancelled = true;
    };
  }, [activeAccount]);

  useEffect(() => {
    if (!activeAccount || reviewState !== null || !tasksQuery.data) return;

    const baseline = buildReviewStateBaseline(tasksQuery.data.review);
    setReviewState(baseline);
    void writeTaskReviewState(activeAccount.id, baseline);
  }, [activeAccount, reviewState, tasksQuery.data]);

  const { dueItems, gradeItems, referenceNow } = useMemo(() => {
    const referenceNow = Date.now();
    const dueItems: TaskListItem[] = [...(tasksQuery.data?.actionable ?? [])]
      .filter((task) => !isExpiredIncompleteTask(task, referenceNow))
      .sort(compareByDueAt)
      .map((task) => ({
        id: task.id,
        task,
      }));

    const gradeItems: TaskListItem[] = [...(tasksQuery.data?.review ?? [])]
      .sort(compareByReviewAt)
      .map((task) => ({
        id: task.id,
        task,
        badge: reviewState && isUnseenReview(task, reviewState) ? "New grade" : undefined,
      }));

    return { dueItems, gradeItems, referenceNow };
  }, [reviewState, tasksQuery.data]);

  const items = selectedTab === "due" ? dueItems : gradeItems;

  const openTask = useCallback(
    (task: MobileTaskItem) => {
      if (selectedTab === "grades" && activeAccount && task.reviewAt != null) {
        void markTaskReviewSeen({
          accountId: activeAccount.id,
          taskId: task.id,
          reviewAt: task.reviewAt,
        }).then(setReviewState);
      }

      router.push(task.route);
    },
    [activeAccount, selectedTab],
  );

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
          extraData={selectedTab}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.contentContainer}
          ListHeaderComponent={
            <View style={styles.tabContainer}>
              <SegmentedControl
                values={[`Due ${dueItems.length}`, `Grades ${gradeItems.length}`]}
                selectedIndex={TASK_TAB_IDS.indexOf(selectedTab)}
                onChange={({ nativeEvent }) => {
                  const next = TASK_TAB_IDS[nativeEvent.selectedSegmentIndex];
                  if (next) setSelectedTab(next);
                }}
              />
            </View>
          }
          ListEmptyComponent={
            tasksQuery.isLoading ? (
              <LoadingState />
            ) : selectedTab === "grades" ? (
              <EmptyState
                title="No grades to review"
                description="New grades will show here."
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
              mode={selectedTab}
              badge={item.badge}
              first={index === 0}
              last={index === items.length - 1}
              onPress={openTask}
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
  mode,
  badge,
  first = false,
  last = false,
  onPress,
}: {
  task: MobileTaskItem;
  now: number;
  mode: TaskTabId;
  badge?: string;
  first?: boolean;
  last?: boolean;
  onPress: (task: MobileTaskItem) => void;
}) {
  const detail = mode === "grades" ? formatReviewDetail(task, now) : formatDueDetail(task, now);
  const subtitle = mode === "grades"
    ? [task.courseTitle, task.subtitle].filter(Boolean).join("  ·  ")
    : [task.courseTitle, task.subtitle, formatDueContext(task, now)].filter(Boolean).join("  ·  ");
  const kindTone = getKindTone(task.kind);

  return (
    <InsetRow
      first={first}
      last={last}
      title={task.title}
      subtitle={subtitle}
      detail={detail}
      leading={<SymbolBadge symbol={kindTone.symbol} tint={kindTone.color} backgroundColor={kindTone.backgroundColor} />}
      accessory={
        badge ? <ReviewBadge label={badge} /> : null
      }
      onPress={() => onPress(task)}
    />
  );
}

function ReviewBadge({ label }: { label: string }) {
  return (
    <View style={styles.reviewBadge}>
      <View style={styles.reviewBadgeDot} />
      <Text selectable style={styles.reviewBadgeLabel}>
        {label}
      </Text>
    </View>
  );
}

function compareByDueAt(left: MobileTaskItem, right: MobileTaskItem) {
  const leftTimestamp = getDueTimestamp(left);
  const rightTimestamp = getDueTimestamp(right);

  if (leftTimestamp !== rightTimestamp) return leftTimestamp - rightTimestamp;
  if (left.courseTitle !== right.courseTitle) return left.courseTitle.localeCompare(right.courseTitle);
  return left.title.localeCompare(right.title);
}

function compareByReviewAt(left: MobileTaskItem, right: MobileTaskItem) {
  const leftTimestamp = left.reviewAt ?? left.sortTimestamp;
  const rightTimestamp = right.reviewAt ?? right.sortTimestamp;

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

function formatDueDetail(task: MobileTaskItem, now: number) {
  const timestamp = getDueTimestamp(task);
  if (!timestamp) {
    return "No due date";
  }

  const dueAt = timestamp * 1000;
  const delta = dueAt - now;
  const day = 24 * 60 * 60 * 1000;

  if (delta < 0) return "Overdue";
  if (delta < day) return `Today ${formatTime(dueAt)}`;
  if (delta < 2 * day) return `Tomorrow ${formatTime(dueAt)}`;
  return formatRelativeDate(dueAt);
}

function formatDueContext(task: MobileTaskItem, now: number) {
  const timestamp = getDueTimestamp(task);
  if (!timestamp) return undefined;

  const dueAt = timestamp * 1000;
  const delta = dueAt - now;
  const day = 24 * 60 * 60 * 1000;

  if (delta < 0) return `Was due ${formatRelativeDate(dueAt)} ${formatTime(dueAt)}`;
  if (delta < 2 * day) return "Due soon";
  return `Due ${formatTime(dueAt)}`;
}

function formatReviewDetail(task: MobileTaskItem, now: number) {
  if (!task.reviewAt) return "Review";

  const reviewedAt = task.reviewAt * 1000;
  const delta = now - reviewedAt;
  const day = 24 * 60 * 60 * 1000;

  if (delta < day) return "Today";
  if (delta < 2 * day) return "Yesterday";
  return formatRelativeDate(reviewedAt);
}

function isUnseenReview(task: MobileTaskItem, reviewState: TaskReviewState) {
  if (task.reviewAt == null) return false;
  return (reviewState[task.id] ?? 0) < task.reviewAt;
}

function buildReviewStateBaseline(tasks: readonly MobileTaskItem[]) {
  const baseline: TaskReviewState = {};

  for (const task of tasks) {
    if (task.reviewAt != null) {
      baseline[task.id] = task.reviewAt;
    }
  }

  return baseline;
}

function getDueTimestamp(task: MobileTaskItem) {
  return task.dueAt ?? task.closeAt ?? task.openAt ?? task.sortTimestamp;
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

const styles = StyleSheet.create({
  contentContainer: {
    ...nativePageContentContainerStyle,
    gap: 0,
  },
  tabContainer: {
    paddingBottom: 12,
  },
  reviewBadge: {
    maxWidth: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(255,59,48,0.12)",
  },
  reviewBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF3B30",
  },
  reviewBadgeLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700" as const,
    color: "#FF3B30",
  },
});
