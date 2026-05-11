import React from "react";
import { Pressable, Text, type ColorValue, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { platformColors } from "@/constants/platform-colors";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

type PrimaryButtonProps = Omit<PressableProps, "style"> & {
  label: string;
  style?: StyleProp<ViewStyle>;
  variant?: "filled" | "tinted" | "plain";
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({ label, style, variant = "filled", ...rest }: PrimaryButtonProps) {
  const pressed = useSharedValue(0);
  const disabled = rest.disabled ?? false;

  const tapGesture = React.useMemo(
    () =>
      Gesture.Tap()
        .enabled(!disabled)
        .onBegin(() => {
          pressed.set(withSpring(1, { damping: 15, stiffness: 400 }));
        })
        .onFinalize(() => {
          pressed.set(withSpring(0, { damping: 15, stiffness: 400 }));
        }),
    [disabled, pressed],
  );

  const animStyle = useAnimatedStyle(() => {
    const scale = interpolate(pressed.get(), [0, 1], [1, 0.97]);
    return {
      transform: [{ scale }],
    };
  });

  const bgColor: ColorValue = variant === "filled" ? platformColors.systemBlue : platformColors.tertiarySystemFill;
  const textColor: ColorValue = variant === "filled" ? "#FFFFFF" : platformColors.systemBlue;

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View style={[animStyle, style] as never}>
        <AnimatedPressable style={[styles.button, { backgroundColor: bgColor, opacity: disabled ? 0.5 : 1 }]} {...rest}>
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        </AnimatedPressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = {
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderCurve: "continuous" as const,
  },
  label: {
    fontWeight: "700" as const,
    fontSize: 17,
  },
};
