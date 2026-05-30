import AsyncStorage from "@react-native-async-storage/async-storage";

const TASK_REVIEW_STATE_KEY_PREFIX = "moodle.mobile.task-review-state";

function buildTaskReviewStateKey(accountId: string) {
  return `${TASK_REVIEW_STATE_KEY_PREFIX}.${accountId}`;
}

export type TaskReviewState = Record<string, number>;

export async function readTaskReviewState(accountId: string): Promise<TaskReviewState | null> {
  const raw = await AsyncStorage.getItem(buildTaskReviewStateKey(accountId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
    );
  } catch {
    return {};
  }
}

export async function writeTaskReviewState(accountId: string, state: TaskReviewState) {
  await AsyncStorage.setItem(buildTaskReviewStateKey(accountId), JSON.stringify(state));
}

export async function markTaskReviewSeen(input: {
  accountId: string;
  taskId: string;
  reviewAt: number;
}) {
  const previous = await readTaskReviewState(input.accountId) ?? {};
  const next = {
    ...previous,
    [input.taskId]: Math.max(previous[input.taskId] ?? 0, input.reviewAt),
  };

  await AsyncStorage.setItem(buildTaskReviewStateKey(input.accountId), JSON.stringify(next));
  return next;
}
