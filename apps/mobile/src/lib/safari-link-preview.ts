import { NativeModules } from "react-native";

type SafariLinkPreviewModuleType = {
  present(url: string): Promise<void>;
};

const nativeModule = NativeModules.SafariLinkPreviewModule as SafariLinkPreviewModuleType | undefined;

export async function presentSafariLinkPreview(url: string) {
  if (!nativeModule) {
    throw new Error("SafariLinkPreviewModule is unavailable.");
  }

  await nativeModule.present(url);
}
