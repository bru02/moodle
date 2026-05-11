import { router, Stack } from "expo-router";

import { NativeIconButton } from "@/components/native-icon-button";
import { platformColors } from "@/constants/platform-colors";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: platformColors.systemGroupedBackground } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="accounts-sheet"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.48, 0.92],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen
        name="resource-preview"
        options={{
          presentation: process.env.EXPO_OS === "ios" ? "fullScreenModal" : "modal",
          gestureEnabled: true,
          headerShown: true,
          title: "Preview",
          headerTitleAlign: "center",
          headerTransparent: true,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: platformColors.systemGroupedBackground },
          headerRight: () => (
            <NativeIconButton label="Close preview" systemImage="xmark" onPress={() => router.back()} style={{ marginRight: 8 }} />
          ),
        }}
      />
      <Stack.Screen
        name="login-sheet"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 0.9],
          gestureEnabled: false,
          headerShown: false,
        }}
      />
    </Stack>
  );
}
