import React from "react";
import { ScrollView, View, type ScrollViewProps, type ViewProps } from "react-native";

import { platformColors } from "@/constants/platform-colors";
import { BottomTabInset, MaxContentWidth } from "@/constants/theme";

type ScreenShellProps = {
  children: React.ReactNode;
  scrollViewProps?: Omit<ScrollViewProps, "children">;
  containerProps?: ViewProps;
};

export function ScreenShell({ children, scrollViewProps, containerProps }: ScreenShellProps) {
  const bgColor = platformColors.systemBackground;

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }} {...containerProps}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        {...scrollViewProps}
        contentContainerStyle={[
          {
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: BottomTabInset + 28,
            gap: 16,
            width: "100%",
            maxWidth: MaxContentWidth,
            alignSelf: "center",
          },
          scrollViewProps?.contentContainerStyle,
        ]}
        style={[{ flex: 1 }, scrollViewProps?.style]}
      >
        {children}
      </ScrollView>
    </View>
  );
}
