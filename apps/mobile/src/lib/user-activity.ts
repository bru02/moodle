import { Platform } from "react-native";
import { donateUserActivity as nativeDonate, clearCurrentUserActivity as nativeClear } from "../../modules/universal-links";
import type { DonateUserActivityInput } from "../../modules/universal-links";

export type { DonateUserActivityInput };

export async function donateUserActivity(input: DonateUserActivityInput) {
  if (Platform.OS !== "ios") {
    return;
  }

  await nativeDonate(input);
}

export async function clearCurrentUserActivity() {
  if (Platform.OS !== "ios") {
    return;
  }

  await nativeClear();
}
