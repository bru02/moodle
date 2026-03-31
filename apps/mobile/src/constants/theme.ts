import { Platform } from "react-native";

// Legacy Colors kept for compatibility — prefer shared platformColors constants.
export const Colors = {
  light: {
    text: "#000000",
    background: "#F2F2F7",
    backgroundElement: "#FFFFFF",
    backgroundSelected: "rgba(120,120,128,0.12)",
    textSecondary: "rgba(60,60,67,0.6)",
  },
  dark: {
    text: "#FFFFFF",
    background: "#000000",
    backgroundElement: "#1C1C1E",
    backgroundSelected: "rgba(120,120,128,0.2)",
    textSecondary: "rgba(235,235,245,0.6)",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 20,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
