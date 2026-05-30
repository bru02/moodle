import { router, type Href } from "expo-router";
import { Pressable } from "react-native";

import { AccountAvatar } from "@/components/account-avatar";
import { HeaderGlassSurface } from "@/components/header-glass-surface";
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
      onPress={() => router.push("/accounts-sheet" as Href)}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      <HeaderGlassSurface>
        <AccountAvatar label={activeAccount.label} avatarUrl={activeAccount.avatarUrl} size={30} />
      </HeaderGlassSurface>
    </Pressable>
  );
}
