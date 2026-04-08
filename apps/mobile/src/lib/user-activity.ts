import { NativeModules, Platform } from "react-native";

type DonateUserActivityInput = {
  activityType: string;
  title: string;
  description?: string;
  route?: string;
  url?: string;
  userInfo?: Record<string, string | number | boolean | null | undefined>;
  keywords?: string[];
  persistentIdentifier?: string;
  eligibleForSearch?: boolean;
  eligibleForPrediction?: boolean;
  isPubliclyIndexable?: boolean;
};

type UniversalLinksModuleShape = {
  donateUserActivity(payload: DonateUserActivityInput): Promise<void>;
  clearCurrentUserActivity(): Promise<void>;
};

const universalLinksModule = NativeModules.UniversalLinksModule as UniversalLinksModuleShape | undefined;

export async function donateUserActivity(input: DonateUserActivityInput) {
  if (
    Platform.OS !== "ios" ||
    !universalLinksModule ||
    typeof universalLinksModule.donateUserActivity !== "function"
  ) {
    return;
  }

  await universalLinksModule.donateUserActivity({
    ...input,
    eligibleForSearch: input.eligibleForSearch ?? true,
    eligibleForPrediction: input.eligibleForPrediction ?? true,
    isPubliclyIndexable: input.isPubliclyIndexable ?? false,
  });
}

export async function clearCurrentUserActivity() {
  if (
    Platform.OS !== "ios" ||
    !universalLinksModule ||
    typeof universalLinksModule.clearCurrentUserActivity !== "function"
  ) {
    return;
  }

  await universalLinksModule.clearCurrentUserActivity();
}
