import React from "react";
import { Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

type EmptyStateProps = {
  title: string;
  subtitle?: string;
  description?: string;
};

export function EmptyState({ title, subtitle, description }: EmptyStateProps) {
  const copy = subtitle ?? description ?? "";

  const labelColor = platformColors.secondaryLabel;

  return (
    <View style={{ padding: 16, gap: 4 }}>
      <Text
        style={{
          fontSize: 15,
          fontWeight: "600",
          color: labelColor,
        }}
      >
        {title}
      </Text>
      {copy ? (
        <Text
          selectable
          style={{
            fontSize: 14,
            color: labelColor,
            lineHeight: 20,
          }}
        >
          {copy}
        </Text>
      ) : null}
    </View>
  );
}
