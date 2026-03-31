import React from "react";
import { Pressable, Text, type ColorValue, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { platformColors } from "@/constants/platform-colors";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";

type PrimaryButtonProps = Omit<PressableProps, "style"> & {
  label: string;
  style?: StyleProp<ViewStyle>;
  variant?: "filled" | "tinted" | "plain";
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({ label, style, variant = "filled", onPressIn, onPressOut, ...rest }: PrimaryButtonProps) {
  const scale = useSharedValue(1);
  const disabled = rest.disabled ?? false;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bgColor: ColorValue = variant === "filled" ? platformColors.systemBlue : platformColors.tertiarySystemFill;

  const textColor: ColorValue = variant === "filled"
    ? "#FFFFFF"
    : platformColors.systemBlue;

  return (
    <Animated.View style={[animStyle, style]}>
      <AnimatedPressable
        onPressIn={(e) => {
          if (disabled) {
            onPressIn?.(e);
            return;
          }
          scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          if (disabled) {
            onPressOut?.(e);
            return;
          }
          scale.value = withSpring(1, { damping: 15, stiffness: 400 });
          onPressOut?.(e);
        }}
        style={{
          alignItems: "center",
          justifyContent: "center",
          minHeight: 48,
          paddingHorizontal: 24,
          borderRadius: 14,
          borderCurve: "continuous",
          backgroundColor: bgColor,
          opacity: disabled ? 0.5 : 1,
        }}
        {...rest}
      >
        <Text
          style={{
            fontWeight: "700",
            fontSize: 17,
            color: textColor,
          }}
        >
          {label}
        </Text>
      </AnimatedPressable>
    </Animated.View>
  );
}
