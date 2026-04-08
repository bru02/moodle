import { buildAuthenticatedExternalOpenUrl, buildExternalOpenUrl } from "@moodle/core";
import { Action, Icon, LocalStorage, open } from "@raycast/api";

import { getUser } from "../client";
import { shortcut } from "../helpers";
import { siteOrigin } from "../helpers/preferences";

let timestamp: string | undefined;

export async function openInBrowserWithAuth(url: string, onOpen?: () => void) {
  const user = await getUser();
  const { token, privateToken, id } = user;
  const direct = async (u = url) => (await open(u), onOpen?.());

  const externalUrl = buildExternalOpenUrl({
    url,
    siteOrigin,
    accessKey: user.accessKey,
  });

  if (new URL(externalUrl).origin !== siteOrigin) return direct(externalUrl);
  if (externalUrl.includes("/pluginfile.php") || externalUrl.includes("/tokenpluginfile.php/"))
    return direct(externalUrl);

  timestamp ??= (await LocalStorage.getItem<string>("lastAutoLoginTimestamp")) ?? undefined;
  const lastLogin = timestamp ? Number(timestamp) : NaN;
  const recentlyLoggedIn = Number.isFinite(lastLogin) && lastLogin + 6 * 60000 >= Date.now();

  const authenticatedUrl = await buildAuthenticatedExternalOpenUrl({
    url,
    siteOrigin,
    accessKey: user.accessKey,
    token,
    privateToken,
    userId: id,
    lastAutoLoginAt: recentlyLoggedIn ? lastLogin : undefined,
  });

  if (authenticatedUrl !== externalUrl) {
    timestamp = Date.now().toString();
    await LocalStorage.setItem("lastAutoLoginTimestamp", timestamp);
  }

  return await direct(authenticatedUrl);
}

export function OpenInBrowserAction({
  url,
  onOpen,
  title = "Open in Browser",
  icon = Icon.Globe,
}: {
  url: string;
  onOpen?: () => void;
  title?: string;
  icon?: Icon;
}) {
  return (
    <Action
      title={title}
      onAction={async () => {
        return openInBrowserWithAuth(url, onOpen);
      }}
      shortcut={shortcut("b")}
      icon={icon}
    />
  );
}
