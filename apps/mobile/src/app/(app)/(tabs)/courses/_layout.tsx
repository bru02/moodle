import { Stack } from "expo-router";

export default function CoursesLayout() {
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
      <Stack.Screen name="index" options={{ title: "Courses", headerTitleAlign: "left" }} />
      <Stack.Screen name="[courseId]" options={{ title: "Course", headerLargeTitle: false }} />
      <Stack.Screen name="[courseId]/grades" options={{ title: "Grades", headerLargeTitle: false }} />
      <Stack.Screen name="[courseId]/content/[contentId]" options={{ title: "Content", headerLargeTitle: false }} />
    </Stack>
  );
}
