import { Stack } from "expo-router";

import { tabStackScreenOptions } from "../courses/_layout";

export default function TasksLayout() {
  return (
    <Stack screenOptions={tabStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "Tasks" }} />
      <Stack.Screen name="[taskId]" options={{ title: "Task", headerLargeTitle: false }} />
      <Stack.Screen
        name="content/[courseId]/[contentId]"
        options={{
          title: "Content",
          headerLargeTitle: false,
          fullScreenGestureEnabled: false,
          gestureResponseDistance: { start: 24 },
        }}
      />
    </Stack>
  );
}
