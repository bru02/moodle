import { Image } from "expo-image";
import { Pressable, ScrollView, Text, View, type ColorValue, type PressableProps, type ScrollViewProps, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { platformColors } from "@/constants/platform-colors";

import { BottomTabInset, MaxContentWidth } from "@/constants/theme";

export const nativePageContentContainerStyle = {
  width: "100%",
  maxWidth: MaxContentWidth,
  alignSelf: "center",
  paddingHorizontal: 16,
  paddingTop: 8,
  paddingBottom: BottomTabInset + 28,
  gap: 24,
} satisfies ViewStyle;

export function NativePage({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const backgroundColor = platformColors.systemGroupedBackground;

  return <View style={[{ flex: 1, backgroundColor }, style]}>{children}</View>;
}

export function NativeScrollPage({
  children,
  scrollViewProps,
}: {
  children: React.ReactNode;
  scrollViewProps?: Omit<ScrollViewProps, "children">;
}) {
  const backgroundColor = platformColors.systemGroupedBackground;

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        {...scrollViewProps}
        contentContainerStyle={[nativePageContentContainerStyle, scrollViewProps?.contentContainerStyle]}
        style={[{ flex: 1 }, scrollViewProps?.style]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  const labelColor = platformColors.label;
  const secondaryColor = platformColors.secondaryLabel;

  return (
    <View style={{ gap: 4, paddingHorizontal: 2 }}>
      {eyebrow ? (
        <Text selectable style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.2, color: secondaryColor }}>
          {eyebrow.toUpperCase()}
        </Text>
      ) : null}
      <Text selectable style={{ fontSize: 28, lineHeight: 34, fontWeight: "700", color: labelColor }}>
        {title}
      </Text>
      {subtitle ? (
        <Text selectable style={{ fontSize: 15, lineHeight: 21, color: secondaryColor }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function InsetGroup({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const backgroundColor = platformColors.secondarySystemGroupedBackground;

  return (
    <View
      style={[
        {
          overflow: "hidden",
          borderRadius: 16,
          borderCurve: "continuous",
          backgroundColor,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function GroupHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  const labelColor = platformColors.label;
  const secondaryColor = platformColors.secondaryLabel;

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text selectable style={{ fontSize: 20, lineHeight: 24, fontWeight: "700", color: labelColor }}>
          {title}
        </Text>
        {subtitle ? (
          <Text selectable style={{ fontSize: 13, lineHeight: 18, color: secondaryColor }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function StatPill({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint?: ColorValue;
}) {
  const labelColor = platformColors.secondaryLabel;
  const valueColor = tint ?? platformColors.label;
  const backgroundColor = platformColors.secondarySystemGroupedBackground;
  const separatorColor = platformColors.separator;

  return (
    <View
      style={{
        minWidth: 96,
        flex: 1,
        gap: 2,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor,
        borderWidth: 1,
        borderColor: separatorColor,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Text selectable style={{ fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 0.3, color: labelColor }}>
        {label.toUpperCase()}
      </Text>
      <Text selectable numberOfLines={2} style={{ fontSize: 18, lineHeight: 24, fontWeight: "700", color: valueColor }}>
        {value}
      </Text>
    </View>
  );
}

type InsetRowProps = PressableProps & {
  title: string;
  subtitle?: string;
  detail?: string;
  accessory?: React.ReactNode;
  leading?: React.ReactNode;
  showChevron?: boolean;
  first?: boolean;
  last?: boolean;
};

export function InsetRow({
  title,
  subtitle,
  detail,
  accessory,
  leading,
  showChevron = true,
  first = false,
  last = false,
  style,
  onPressIn,
  onPressOut,
  ...props
}: InsetRowProps) {
  const labelColor = platformColors.label;
  const secondaryColor = platformColors.secondaryLabel;
  const separatorColor = platformColors.separator;
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.get() * 0.04 }],
    opacity: 1 - pressed.get() * 0.25,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        unstable_pressDelay={0}
        hitSlop={4}
        {...props}
        onPressIn={(event) => {
          pressed.set(withTiming(1, { duration: 90 }));
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          pressed.set(withTiming(0, { duration: 180 }));
          onPressOut?.(event);
        }}
        style={(state) => [
          {
            paddingHorizontal: 16,
            paddingVertical: 14,
            gap: 10,
          },
          !first
            ? {
                borderTopWidth: 1,
                borderTopColor: separatorColor,
              }
            : null,
          !last ? null : undefined,
          typeof style === "function" ? style(state) : style,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }} pointerEvents="none">
          {leading ? <View>{leading}</View> : null}
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 16, lineHeight: 20, fontWeight: "600", color: labelColor }}>
                {title}
              </Text>
              {detail ? (
                <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 19, fontWeight: "600", color: secondaryColor }}>
                  {detail}
                </Text>
              ) : null}
            </View>
            {subtitle ? (
              <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: secondaryColor }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {accessory}
          {showChevron ? <Chevron /> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function SymbolBadge({
  symbol,
  tint,
  backgroundColor,
}: {
  symbol: string;
  tint?: ColorValue;
  backgroundColor?: ColorValue;
}) {
  const resolvedTint = tint ?? platformColors.systemBlue;
  const resolvedBackground = backgroundColor ?? platformColors.tertiarySystemFill;

  return (
    <View
      style={{
        width: 34,
        height: 34,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 11,
        borderCurve: "continuous",
        backgroundColor: resolvedBackground,
      }}
    >
      <Image source={`sf:${symbol}`} style={{ width: 18, height: 18, tintColor: resolvedTint }} contentFit="contain" />
    </View>
  );
}

function Chevron() {
  const color = platformColors.tertiaryLabel;

  return <Image source="sf:chevron.right" style={{ width: 12, height: 12, tintColor: color }} contentFit="contain" />;
}
