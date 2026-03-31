import { View } from "react-native";
import RNAnimated from "react-native-reanimated";

export const Animated = {
  ...RNAnimated,
  View: RNAnimated.createAnimatedComponent(View),
};
