import { Stack } from "expo-router";

export const tabStackScreenOptions = {
  headerLargeTitle: true,
  headerTransparent: true,
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerBlurEffect: "regular",
  contentStyle: { backgroundColor: "transparent" },
  headerBackButtonDisplayMode: "minimal",
} as const;

export default function CoursesLayout() {
  return (
    <Stack
      screenOptions={tabStackScreenOptions}
    >
      <Stack.Screen name="index" options={{ title: "Courses" }} />
      <Stack.Screen name="[courseId]" options={{ title: "Course", headerLargeTitle: false }} />
      <Stack.Screen name="[courseId]/grades" options={{ title: "Grades", headerLargeTitle: false }} />
      <Stack.Screen
        name="[courseId]/content/[contentId]"
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
