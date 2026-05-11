import SafariLinkPreviewModule from "./src/SafariLinkPreviewModule";

export type SafariLinkPreviewSourceRect = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  lineRects?: SafariLinkPreviewLineRect[];
  previewRect?: SafariLinkPreviewRect;
};

export type SafariLinkPreviewLineRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SafariLinkPreviewRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function presentSafariLinkPreview(url: string, sourceRect?: SafariLinkPreviewSourceRect) {
  await SafariLinkPreviewModule.present(url, sourceRect);
}
