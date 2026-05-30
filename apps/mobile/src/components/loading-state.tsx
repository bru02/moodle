import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, type StyleProp, View, type ViewStyle } from "react-native";

type LoadingStateProps = {
  delayHapticMs?: number;
  delayVisibleMs?: number;
  style?: StyleProp<ViewStyle>;
};

export function LoadingState({ delayHapticMs = 700, delayVisibleMs = 180, style }: LoadingStateProps) {
  const [isVisible, setIsVisible] = useState(delayVisibleMs <= 0);
  const shouldHapticOnCompleteRef = useRef(false);

  useEffect(() => {
    shouldHapticOnCompleteRef.current = false;
    setIsVisible(delayVisibleMs <= 0);

    const visibleTimer = delayVisibleMs > 0
      ? globalThis.setTimeout(() => {
        setIsVisible(true);
      }, delayVisibleMs)
      : undefined;

    const hapticTimer = globalThis.setTimeout(() => {
      shouldHapticOnCompleteRef.current = true;
    }, delayHapticMs);

    return () => {
      if (visibleTimer) {
        globalThis.clearTimeout(visibleTimer);
      }
      globalThis.clearTimeout(hapticTimer);

      if (shouldHapticOnCompleteRef.current) {
        void Haptics.selectionAsync().catch(() => undefined);
      }
    };
  }, [delayHapticMs, delayVisibleMs]);

  if (!isVisible) {
    return null;
  }

  return (
    <View accessibilityRole="progressbar" style={[{ padding: 16, alignItems: "flex-start" }, style]}>
      <ActivityIndicator />
    </View>
  );
}
