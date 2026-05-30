import UniversalLinksModule from "./src/UniversalLinksModule";

export type DonateUserActivityInput = {
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

export async function openUniversalLinkOnly(url: string): Promise<boolean> {
  return (await UniversalLinksModule?.openUniversalLinkOnly(url)) ?? false;
}

export async function donateUserActivity(input: DonateUserActivityInput) {
  await UniversalLinksModule?.donateUserActivity({
    ...input,
    eligibleForSearch: input.eligibleForSearch ?? true,
    eligibleForPrediction: input.eligibleForPrediction ?? true,
    isPubliclyIndexable: input.isPubliclyIndexable ?? false,
  });
}

export async function clearCurrentUserActivity() {
  await UniversalLinksModule?.clearCurrentUserActivity();
}
