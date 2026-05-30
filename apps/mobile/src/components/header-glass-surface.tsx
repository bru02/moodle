import { buttonStyle, controlSize, labelStyle } from "@expo/ui/swift-ui/modifiers";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type React from "react";
import { StyleSheet, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

export function headerIconButtonModifiers() {
  return [
    labelStyle("iconOnly"),
    buttonStyle(isLiquidGlassAvailable() ? "glass" : "bordered"),
    controlSize("large"),
  ];
}

export function HeaderGlassSurface({ children }: { children: React.ReactNode }) {
  if (process.env.EXPO_OS === "ios" && isLiquidGlassAvailable()) {
    return <GlassView style={styles.surface}>{children}</GlassView>;
  }

  if (process.env.EXPO_OS === "ios") {
    return (
      <BlurView tint="systemChromeMaterial" intensity={82} style={styles.surface}>
        {children}
      </BlurView>
    );
  }

  return <View style={[styles.surface, styles.fallbackSurface]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: platformColors.separator,
  },
  fallbackSurface: {
    backgroundColor: platformColors.secondarySystemGroupedBackground,
  },
});
