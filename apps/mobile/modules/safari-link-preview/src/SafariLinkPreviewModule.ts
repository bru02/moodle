import { requireNativeModule } from "expo";

type SafariLinkPreviewSourceRect = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  lineRects?: SafariLinkPreviewLineRect[];
  previewRect?: SafariLinkPreviewRect;
};

type SafariLinkPreviewLineRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SafariLinkPreviewRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

declare class SafariLinkPreviewModuleType {
  present(url: string, sourceRect?: SafariLinkPreviewSourceRect): Promise<void>;
}

export default requireNativeModule<SafariLinkPreviewModuleType>("SafariLinkPreviewModule");
