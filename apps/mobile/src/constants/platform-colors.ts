import { Platform, PlatformColor, type ColorValue } from "react-native";

const selectPlatformColor = (iosColor: string, fallback: string): ColorValue =>
  Platform.select<ColorValue>({ ios: PlatformColor(iosColor), default: fallback }) ?? fallback;

export const platformColors = {
  label: selectPlatformColor("label", "#000000"),
  secondaryLabel: selectPlatformColor("secondaryLabel", "rgba(60,60,67,0.6)"),
  tertiaryLabel: selectPlatformColor("tertiaryLabel", "rgba(60,60,67,0.3)"),
  placeholderText: selectPlatformColor("placeholderText", "rgba(60,60,67,0.3)"),
  separator: selectPlatformColor("separator", "rgba(60,60,67,0.16)"),
  systemBackground: selectPlatformColor("systemBackground", "#F2F2F7"),
  systemBlue: selectPlatformColor("systemBlue", "#007AFF"),
  systemGreen: selectPlatformColor("systemGreen", "#34C759"),
  systemGroupedBackground: selectPlatformColor("systemGroupedBackground", "#F2F2F7"),
  systemOrange: selectPlatformColor("systemOrange", "#FF9500"),
  systemRed: selectPlatformColor("systemRed", "#FF3B30"),
  systemPurple: selectPlatformColor("systemPurple", "#AF52DE"),
  systemPink: selectPlatformColor("systemPink", "#FF2D55"),
  systemTeal: selectPlatformColor("systemTeal", "#30B0C7"),
  systemIndigo: selectPlatformColor("systemIndigo", "#5856D6"),
  systemYellow: selectPlatformColor("systemYellow", "#FFCC00"),
  systemBrown: selectPlatformColor("systemBrown", "#A2845E"),
  systemGray: selectPlatformColor("systemGray", "#8E8E93"),
  secondarySystemBackground: selectPlatformColor("secondarySystemBackground", "#FFFFFF"),
  secondarySystemGroupedBackground: selectPlatformColor("secondarySystemGroupedBackground", "#FFFFFF"),
  tertiarySystemFill: selectPlatformColor("tertiarySystemFill", "rgba(120,120,128,0.12)"),
  tertiarySystemGroupedBackground: selectPlatformColor("tertiarySystemGroupedBackground", "rgba(120,120,128,0.08)"),
} as const;
