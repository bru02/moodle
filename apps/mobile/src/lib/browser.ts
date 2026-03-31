import * as WebBrowser from "expo-web-browser";
import { Linking, NativeModules, Platform } from "react-native";

type UniversalLinksModuleShape = {
  openUniversalLinkOnly(url: string): Promise<boolean>;
};

const universalLinksModule = NativeModules.UniversalLinksModule as UniversalLinksModuleShape | undefined;

export async function openExternalUrl(url: string) {
  if (Platform.OS === "web") {
    await Linking.openURL(url);
    return;
  }

  if ((Platform.OS === "ios" || Platform.OS === "android") && /^https?:\/\//i.test(url) && universalLinksModule) {
    try {
      const opened = await universalLinksModule.openUniversalLinkOnly(url);
      if (opened) {
        return;
      }
    } catch {
      // Fall back to the in-app browser when the universal-link handoff is unavailable.
    }
  }

  await WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
  });
}
