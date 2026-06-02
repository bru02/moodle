import { environment } from "@raycast/api";

(async () => {
  if (process.platform !== "darwin" || !environment.isDevelopment) {
    return;
  }

  const [{ getMacSystemProxy }, { ProxyAgent, setGlobalDispatcher }] =
    await Promise.all([import("mac-system-proxy"), import("undici")]);

  let url;

  process.env.PATH ??= "/usr/sbin/";

  const proxy = await getMacSystemProxy();

  if (proxy.HTTPEnable === "1" && proxy.HTTPProxy && proxy.HTTPPort) {
    url = `http://${proxy.HTTPProxy}:${proxy.HTTPPort}`;
  } else if (proxy.HTTPSEnable === "1" && proxy.HTTPSProxy && proxy.HTTPSPort) {
    url = `https://${proxy.HTTPSProxy}:${proxy.HTTPSPort}`;
  }

  if (url) {
    const proxyAgent = new ProxyAgent(url);

    setGlobalDispatcher(proxyAgent);
  }
})();
