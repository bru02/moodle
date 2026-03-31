import { Stack } from "expo-router";

export default function TasksLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: false,
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerBlurEffect: "regular",
        contentStyle: { backgroundColor: "transparent" },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Tasks" }} />
      <Stack.Screen name="[taskId]" options={{ title: "Task", headerLargeTitle: false }} />
      <Stack.Screen name="content/[courseId]/[contentId]" options={{ title: "Content", headerLargeTitle: false }} />
    </Stack>
  );
}
