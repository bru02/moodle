import { router, Stack } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { AccountAvatar } from "@/components/account-avatar";
import { EmptyState } from "@/components/empty-state";
import { InsetGroup, NativeScrollPage } from "@/components/native-ui";
import { PrimaryButton } from "@/components/primary-button";
import { showAccountSwitcherSheet } from "@/lib/account-switcher";
import { useAppState } from "@/providers/app-provider";

export default function AccountsScreen() {
  const { accounts, activeAccountId, setActiveAccount, removeAccount } = useAppState();

  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;
  const greenColor = platformColors.systemGreen;

  return (
    <>
      <Stack.Screen options={{ title: "Accounts" }} />
      <NativeScrollPage>
        {accounts.length === 0 ? (
          <EmptyState
            title="No saved accounts"
            description="Add a site to get started."
          />
        ) : (
          <InsetGroup style={{ padding: 16 }}>
              <Text
                selectable
                style={{
                  fontSize: 22,
                  lineHeight: 28,
                  fontWeight: "700",
                  color: labelColor,
                }}
              >
                Choose an account
              </Text>
              {accounts.map((account) => (
                <View key={account.id}>
                  <Pressable
                    onLongPress={() =>
                      showAccountSwitcherSheet({
                        accounts,
                        activeAccountId,
                        onSelectAccount: async (id) => {
                          await setActiveAccount(id);
                          router.replace("/courses");
                        },
                        onAddAccount: () => router.push("/login-sheet"),
                        onManageAccounts: () => router.push("/accounts"),
                      })
                    }
                    onPress={async () => {
                      await setActiveAccount(account.id);
                      router.replace("/courses");
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                      paddingVertical: 12,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <AccountAvatar
                      label={account.label}
                      avatarUrl={account.avatarUrl}
                      size={50}
                    />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text
                        selectable
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: labelColor,
                        }}
                      >
                        {account.label}
                      </Text>
                      <Text
                        selectable
                        style={{
                          fontSize: 13,
                          color: label2Color,
                        }}
                      >
                        {account.origin}
                      </Text>
                      {account.id === activeAccountId ? (
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: greenColor,
                          }}
                        >
                          Active
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              ))}

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Add account"
                    onPress={() => router.push("/login-sheet")}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Remove active"
                    variant="tinted"
                    onPress={async () => {
                      if (activeAccountId) await removeAccount(activeAccountId);
                    }}
                  />
                </View>
              </View>
          </InsetGroup>
        )}
      </NativeScrollPage>
    </>
  );
}
