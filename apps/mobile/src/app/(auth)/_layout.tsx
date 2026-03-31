import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      initialRouteName="login-sheet"
      screenOptions={{
        headerLargeTitle: true,
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerBlurEffect: "regular",
        contentStyle: { backgroundColor: "transparent" },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen
        name="login-sheet"
        options={{
          headerShown: false,
          headerLargeTitle: false,
          headerTransparent: false,
        }}
      />
      <Stack.Screen name="accounts" options={{ title: "Accounts" }} />
    </Stack>
  );
}
