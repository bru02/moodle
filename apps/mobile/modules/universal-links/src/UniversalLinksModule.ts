import { requireOptionalNativeModule } from "expo";

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

declare class UniversalLinksModuleType {
  openUniversalLinkOnly(url: string): Promise<boolean>;
  donateUserActivity(payload: DonateUserActivityInput): Promise<void>;
  clearCurrentUserActivity(): Promise<void>;
}

export default requireOptionalNativeModule<UniversalLinksModuleType>("UniversalLinksModule");
