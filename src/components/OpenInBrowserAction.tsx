import { Action, Icon, LocalStorage, open } from "@raycast/api";
import { useUser } from "../client";
import { getUrlForService, shortcut, siteHostname } from "../helpers";
import { handleFileUrl } from "../helpers/files";
import { CoreWSExternalWarning } from "../types";

let timestamp;

export function OpenInBrowserAction({
  applyShortcut = false,
  url,
  onOpen,
  title = "Open in Browser",
  icon = Icon.Globe,
}: {
  applyShortcut?: boolean;
  url: string;
  onOpen?: () => void;
  title?: string;
  icon?: Icon;
}) {
  const { token, privateToken, id } = useUser();

  return (
    <Action
      title={title}
      onAction={async () => {
        const direct = async (u = url) => (await open(u), onOpen?.());

        if (new URL(url).hostname !== siteHostname) return direct();

        if (url.includes("/pluginfile.php")) return direct(handleFileUrl(url));

        timestamp ??= await LocalStorage.getItem<string>("lastAutoLoginTimestamp");

        if (+timestamp! + 6 * 60000 >= Date.now() || !privateToken) return direct();

        return fetch(getUrlForService("tool_mobile_get_autologin_key", token), {
          method: "POST",
          headers: { "User-Agent": "MoodleMobile", "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ privatetoken: privateToken }),
        })
          .then((r) => (r.ok ? (r.json() as Promise<CoreSiteAutologinKeyResult>) : Promise.reject()))
          .then(async (d) => {
            if (!d?.autologinurl || !d?.key) return direct();

            direct(`${d.autologinurl}?${new URLSearchParams({ key: d.key, userid: id.toString(), urltogo: url })}`);

            await LocalStorage.setItem("lastAutoLoginTimestamp", (timestamp = Date.now().toString()));
          })
          .catch(() => direct());
      }}
      shortcut={applyShortcut ? shortcut("b") : undefined}
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
