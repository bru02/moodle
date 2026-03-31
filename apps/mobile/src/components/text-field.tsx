import React from "react";
import { TextInput, View, type TextInputProps } from "react-native";

import { platformColors } from "@/constants/platform-colors";

export function TextField({ style, ...rest }: TextInputProps) {
  const shellBg = platformColors.tertiarySystemFill;

  const placeholderColor = platformColors.placeholderText as string;
  const textColor = platformColors.label as string;

  return (
    <View
      style={{
        backgroundColor: shellBg,
        borderRadius: 12,
        borderCurve: "continuous",
        paddingHorizontal: 16,
        minHeight: 50,
        justifyContent: "center",
      }}
    >
      <TextInput
        placeholderTextColor={placeholderColor}
        style={[
          {
            color: textColor,
            fontSize: 17,
            fontWeight: "400",
            minHeight: 24,
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}
