import { environment } from "@raycast/api";
import { getMacSystemProxy } from "mac-system-proxy";
import { ProxyAgent, setGlobalDispatcher } from "undici";

(async () => {
  let url;

  if (environment.isDevelopment) {
    process.env.PATH ??= "/usr/sbin/";

    const proxy = await getMacSystemProxy();

    if (proxy.HTTPEnable === "1" && proxy.HTTPProxy && proxy.HTTPPort) {
      url = `http://${proxy.HTTPProxy}:${proxy.HTTPPort}`;
    } else if (
      proxy.HTTPSEnable === "1" &&
      proxy.HTTPSProxy &&
      proxy.HTTPSPort
    ) {
      url = `https://${proxy.HTTPSProxy}:${proxy.HTTPSPort}`;
    }
  }

  if (url) {
    const proxyAgent = new ProxyAgent(url);

    setGlobalDispatcher(proxyAgent);
  }
})();
