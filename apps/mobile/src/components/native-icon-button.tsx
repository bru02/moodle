import { Button, Host } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, labelStyle, tint } from "@expo/ui/swift-ui/modifiers";
import type { ComponentProps } from "react";
import type { StyleProp, ViewStyle } from "react-native";

type SystemImage = ComponentProps<typeof Button>["systemImage"];

type NativeIconButtonProps = {
  label: string;
  systemImage: SystemImage;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  tintColor?: Parameters<typeof tint>[0];
};

export function NativeIconButton({ label, systemImage, onPress, style, testID, tintColor }: NativeIconButtonProps) {
  return (
    <Host matchContents style={style}>
      <Button
        label={label}
        systemImage={systemImage}
        testID={testID}
        onPress={onPress}
        modifiers={[
          labelStyle("iconOnly"),
          buttonStyle("borderless"),
          controlSize("large"),
          ...(tintColor ? [tint(tintColor)] : []),
        ]}
      />
    </Host>
  );
}
