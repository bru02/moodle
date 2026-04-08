import { router, Stack } from "expo-router";
import { Button, Host } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize } from "@expo/ui/swift-ui/modifiers";

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
          headerShown: true,
          title: "Preview",
          headerTitleAlign: "center",
          headerTransparent: true,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: platformColors.systemGroupedBackground },
          headerLeft: () => (
            <Host matchContents style={{ marginLeft: 8 }}>
              <Button
                label="Close"
                onPress={() => router.back()}
                modifiers={[buttonStyle("bordered"), controlSize("large")]}
              />
            </Host>
          ),
        }}
      />
      <Stack.Screen
        name="login-sheet"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 0.9],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
    </Stack>
  );
}
