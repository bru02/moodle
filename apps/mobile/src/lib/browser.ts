import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";
import { openUniversalLinkOnly } from "../../modules/universal-links";

export async function openExternalUrl(url: string) {
  if (Platform.OS === "web") {
    await Linking.openURL(url);
    return;
  }

  if ((Platform.OS === "ios" || Platform.OS === "android") && /^https?:\/\//i.test(url)) {
    try {
      const opened = await openUniversalLinkOnly(url);
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
