import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import React from "react";
import { View, type ViewProps, type ViewStyle } from "react-native";

import { platformColors } from "@/constants/platform-colors";

type CardProps = ViewProps & {
  tone?: "surface" | "muted" | "prominent";
  innerStyle?: ViewStyle;
};

export function Card({ tone = "surface", style, innerStyle, children, ...rest }: CardProps) {
  const strokeColor = platformColors.separator;
  const fallbackBackground = tone === "muted"
    ? "rgba(120,120,128,0.10)"
    : tone === "prominent"
      ? "rgba(255,255,255,0.98)"
      : "rgba(255,255,255,0.92)";
  const containerStyle: ViewStyle = {
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: strokeColor as string,
    ...(style as ViewStyle),
  };

  const contentStyle: ViewStyle = {
    padding: 16,
    gap: 14,
    ...innerStyle,
  };

  if (process.env.EXPO_OS === "ios") {
    if (isLiquidGlassAvailable()) {
      return (
        <GlassView style={containerStyle} {...rest}>
          <View style={contentStyle}>{children}</View>
        </GlassView>
      );
    }
    return (
      <BlurView
        tint={
          tone === "muted"
            ? "systemThinMaterial"
            : tone === "prominent"
              ? "systemChromeMaterial"
              : "systemMaterial"
        }
        intensity={tone === "prominent" ? 92 : 82}
        style={containerStyle}
        {...rest}
      >
        <View style={contentStyle}>{children}</View>
      </BlurView>
    );
  }

  return (
    <View
      style={[
        containerStyle,
        {
          backgroundColor: fallbackBackground,
        },
      ]}
      {...rest}
    >
      <View style={contentStyle}>{children}</View>
    </View>
  );
}
