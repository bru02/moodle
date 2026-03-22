import { Action, Icon, LocalStorage, open } from "@raycast/api";

import { getUser } from "../client";
import { getUrlForService, shortcut } from "../helpers";
import { handleFileUrl } from "../helpers/files";
import { siteOrigin } from "../helpers/preferences";
import { CoreWSExternalWarning } from "../types";

let timestamp: string | undefined;

function withSemesterParam(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("semester", "-1");
  return parsed.toString();
}

export async function openInBrowserWithAuth(url: string, onOpen?: () => void) {
  const user = await getUser();
  const { token, privateToken, id } = user;
  const direct = async (u = url) => (await open(u), onOpen?.());

  if (new URL(url).origin !== siteOrigin) return direct();

  if (url.includes("/pluginfile.php")) return direct(handleFileUrl(url));

  url = withSemesterParam(url);

  timestamp ??= (await LocalStorage.getItem<string>("lastAutoLoginTimestamp")) ?? undefined;
  const lastLogin = timestamp ? Number(timestamp) : NaN;
  const recentlyLoggedIn = Number.isFinite(lastLogin) && lastLogin + 6 * 60000 >= Date.now();

  if (recentlyLoggedIn || !privateToken) return direct();

  return fetch(getUrlForService("tool_mobile_get_autologin_key", token), {
    method: "POST",
    headers: { "User-Agent": "MoodleMobile", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ privatetoken: privateToken }),
  })
    .then((r) => (r.ok ? (r.json() as Promise<CoreSiteAutologinKeyResult>) : Promise.reject()))
    .then(async (d) => {
      if (!d?.autologinurl || !d?.key) return direct();

      direct(`${d.autologinurl}?${new URLSearchParams({ key: d.key, userid: id.toString(), urltogo: url })}`);

      timestamp = Date.now().toString();
      await LocalStorage.setItem("lastAutoLoginTimestamp", timestamp);
    })
    .catch(() => direct());
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

/**
 * Result of WS tool_mobile_get_autologin_key.
 */
type CoreSiteAutologinKeyResult = {
  key: string; // Auto-login key for a single usage with time expiration.
  autologinurl: string; // Auto-login URL.
  warnings?: CoreWSExternalWarning[];
};
