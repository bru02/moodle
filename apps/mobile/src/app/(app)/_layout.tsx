import { router, Stack } from "expo-router";
import { Button, Host } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize } from "@expo/ui/swift-ui/modifiers";

import { platformColors } from "@/constants/platform-colors";

export default function AppLayout() {
  const isIos = process.env.EXPO_OS === "ios";

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: platformColors.systemGroupedBackground } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="accounts-sheet"
        options={{
          presentation: isIos ? "containedTransparentModal" : "formSheet",
          sheetAllowedDetents: isIos ? undefined : [0.5, 0.9],
          sheetGrabberVisible: isIos ? undefined : true,
          headerShown: !isIos,
          title: "Accounts",
          headerTitleAlign: "center",
          headerTransparent: !isIos,
          headerBlurEffect: isIos ? undefined : "regular",
          contentStyle: { backgroundColor: "transparent" },
          headerLeft: isIos
            ? undefined
            : () => (
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
