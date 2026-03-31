import { router } from "expo-router";
import { Pressable } from "react-native";

import { AccountAvatar } from "@/components/account-avatar";
import { useAppState } from "@/providers/app-provider";

export function HeaderAccountButton() {
  const { activeAccount } = useAppState();

  if (!activeAccount) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open account switcher"
      onPress={() => router.push("/accounts-sheet")}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      <AccountAvatar label={activeAccount.label} avatarUrl={activeAccount.avatarUrl} size={32} />
    </Pressable>
  );
}
