import { NativeModules } from "react-native";

export type SafariLinkPreviewSourceRect = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

type SafariLinkPreviewModuleType = {
  present(url: string, sourceRect?: SafariLinkPreviewSourceRect): Promise<void>;
};

const nativeModule = NativeModules.SafariLinkPreviewModule as SafariLinkPreviewModuleType | undefined;

export async function presentSafariLinkPreview(url: string, sourceRect?: SafariLinkPreviewSourceRect) {
  if (!nativeModule) {
    throw new Error("SafariLinkPreviewModule is unavailable.");
  }

  await nativeModule.present(url, sourceRect);
}
