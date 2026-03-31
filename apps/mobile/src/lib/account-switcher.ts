import { ActionSheetIOS, Alert, Platform } from "react-native";

import type { MoodleAccount } from "./moodle-types";

export function showAccountSwitcherSheet(input: {
  accounts: MoodleAccount[];
  activeAccountId: string | null;
  onSelectAccount(id: string): void;
  onAddAccount(): void;
  onManageAccounts(): void;
}) {
  const options = [
    ...input.accounts.map((account) => account.label),
    "Add account",
    "Manage accounts",
    "Cancel",
  ];

  const destructiveButtonIndex = undefined;
  const cancelButtonIndex = options.length - 1;

  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
      },
      (buttonIndex) => {
        if (buttonIndex == null) return;
        if (buttonIndex < input.accounts.length) {
          input.onSelectAccount(input.accounts[buttonIndex]!.id);
          return;
        }
        if (buttonIndex === input.accounts.length) {
          input.onAddAccount();
          return;
        }
        if (buttonIndex === input.accounts.length + 1) {
          input.onManageAccounts();
        }
      },
    );
    return;
  }

  Alert.alert("Switch account", undefined, [
    ...input.accounts.map((account) => ({
      text: account.label,
      onPress: () => input.onSelectAccount(account.id),
    })),
    { text: "Add account", onPress: input.onAddAccount },
    { text: "Manage accounts", onPress: input.onManageAccounts },
    { text: "Cancel", style: "cancel" },
  ]);
}

