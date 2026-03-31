import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import { presentationDetents, presentationDragIndicator } from "@expo/ui/swift-ui/modifiers";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { AccountAvatar } from "@/components/account-avatar";
import { useAppState } from "@/providers/app-provider";

export default function AccountsSheet() {
  const { accounts, activeAccount, activeAccountId, removeAccount, setActiveAccount } = useAppState();
  const [isPresented, setIsPresented] = useState(false);
  const isClosingRef = useRef(false);
  const isIos = process.env.EXPO_OS === "ios";
  const content = (
    <AccountsSheetContent
      accounts={accounts}
      activeAccount={activeAccount}
      activeAccountId={activeAccountId}
      onSelectAccount={async (id) => {
        if (id !== activeAccountId) {
          await setActiveAccount(id);
        }
        closeSheet();
      }}
      onSignOut={async (id) => {
        await removeAccount(id);
        if (accounts.length <= 1) {
          closeSheet();
        }
      }}
    />
  );

  function closeSheet() {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    setIsPresented(false);
    router.back();
  }

  useEffect(() => {
    if (!isIos) {
      return;
    }

    setIsPresented(true);
  }, [isIos]);

  if (!isIos) {
    return content;
  }

  return (
    <Host style={{ flex: 1, backgroundColor: "transparent" }}>
      <BottomSheet
        isPresented={isPresented}
        onIsPresentedChange={(next) => {
          setIsPresented(next);

          if (!next) {
            closeSheet();
          }
        }}
      >
        <Group
          modifiers={[
            presentationDetents([{ fraction: 0.48 }, "large"]),
            presentationDragIndicator("visible"),
          ]}
        >
          <RNHostView>
            <View style={{ flex: 1, backgroundColor: platformColors.systemGroupedBackground }}>
              {content}
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

function AccountsSheetContent({
  accounts,
  activeAccount,
  activeAccountId,
  onSelectAccount,
  onSignOut,
}: {
  accounts: { id: string; label?: string; avatarUrl?: string; fullname?: string; origin?: string }[];
  activeAccount: { label?: string; avatarUrl?: string; fullname?: string; origin?: string } | null;
  activeAccountId: string | null;
  onSelectAccount(id: string): Promise<void>;
  onSignOut(id: string): Promise<void>;
}) {
  const labelColor = platformColors.label;
  const secondaryLabelColor = platformColors.secondaryLabel;
  const blueColor = platformColors.systemBlue;
  const cellColor = platformColors.secondarySystemGroupedBackground;
  const separatorColor = platformColors.separator;
  const destructiveColor = platformColors.systemRed;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: 24, paddingBottom: 34 }}
      style={{ flex: 1, backgroundColor: platformColors.systemGroupedBackground }}
    >
      {/* Active account header */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <AccountAvatar
          label={activeAccount?.label ?? "Moodle"}
          avatarUrl={activeAccount?.avatarUrl}
          size={52}
          siteOrigin={activeAccount?.origin}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: labelColor,
            }}
            numberOfLines={1}
          >
            {activeAccount?.label ?? "Choose an account"}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: secondaryLabelColor,
            }}
            numberOfLines={1}
          >
            {activeAccount?.fullname ?? activeAccount?.origin ?? ""}
          </Text>
        </View>
      </View>

      {/* Accounts section */}
      <Text
        style={{
          fontSize: 13,
          color: secondaryLabelColor,
          textTransform: "uppercase",
          paddingHorizontal: 20,
          paddingBottom: 6,
        }}
      >
        Accounts
      </Text>

      <View
        style={{
          marginHorizontal: 16,
          borderRadius: 10,
          borderCurve: "continuous",
          backgroundColor: cellColor,
          overflow: "hidden",
        }}
      >
        {accounts.map((account, index) => {
          const isActive = account.id === activeAccountId;
          const isLast = index === accounts.length - 1;

          return (
            <Pressable
              key={account.id}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${account.label ?? "account"}`}
              onPress={() => {
                void onSelectAccount(account.id);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                paddingLeft: 16,
                paddingRight: 12,
                gap: 12,
                backgroundColor: pressed ? platformColors.tertiarySystemFill : "transparent",
              })}
            >
              <AccountAvatar
                label={account.label ?? "Moodle"}
                avatarUrl={account.avatarUrl}
                size={40}
                siteOrigin={account.origin}
              />
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 2,
                  borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: separatorColor,
                  minHeight: 44,
                  gap: 8,
                }}
              >
                <View style={{ flex: 1, gap: 1 }}>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "400",
                      color: labelColor,
                    }}
                    numberOfLines={1}
                  >
                    {account.label ?? "Moodle account"}
                  </Text>
                  {account.fullname ? (
                    <Text
                      style={{ fontSize: 13, color: secondaryLabelColor }}
                      numberOfLines={1}
                    >
                      {account.fullname}
                    </Text>
                  ) : null}
                </View>
                {isActive ? (
                  <Image
                    source="sf:checkmark"
                    style={{ width: 17, height: 17, tintColor: blueColor }}
                    contentFit="contain"
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Sign out & add account */}
      <View style={{ marginTop: 32, gap: 12 }}>
        <View
          style={{
            marginHorizontal: 16,
            borderRadius: 10,
            borderCurve: "continuous",
            backgroundColor: cellColor,
            overflow: "hidden",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add account"
            onPress={() => router.push("/login-sheet")}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 12,
              backgroundColor: pressed ? platformColors.tertiarySystemFill : "transparent",
            })}
          >
            <Text style={{ fontSize: 17, color: blueColor }}>Add Account</Text>
          </Pressable>
        </View>

        {activeAccountId ? (
          <View
            style={{
              marginHorizontal: 16,
              borderRadius: 10,
              borderCurve: "continuous",
              backgroundColor: cellColor,
              overflow: "hidden",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={() => {
                void onSignOut(activeAccountId);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                backgroundColor: pressed ? platformColors.tertiarySystemFill : "transparent",
              })}
            >
              <Text style={{ fontSize: 17, color: destructiveColor }}>Sign Out</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
