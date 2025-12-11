import { LocalStorage } from "@raycast/api";
import { getUrlForService, preferences } from "./helpers";
let user: User | null = null;
let wrappedUser: { read(): User } | null = null;

interface User {
  token: string;
  privateToken?: string;
  accessKey: string;
  id: number;
}

async function getUser() {
  const storedUserData = await LocalStorage.getItem<string>("userData");
  let userData: User;

  if (!storedUserData) {
    const tokenResp = await fetch(`${preferences.site_url}/login/token.php?lang=en`, {
      method: "POST",
      body: new URLSearchParams({
        username: preferences.username!,
        password: preferences.password!,
        service: "moodle_mobile_app",
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const tokenJson = (await tokenResp.json()) as CoreSitesLoginTokenResponse;
    if (!tokenJson.token) throw new Error(tokenJson.error || "Failed to fetch token");
    const { token: newToken, privatetoken } = tokenJson;

    const siteInfoResp = await fetch(getUrlForService("core_webservice_get_site_info", newToken));
    const siteInfoJson = (await siteInfoResp.json()) as {
      userid?: number;
      userprivateaccesskey?: string;
      message?: string;
    };

    if (siteInfoJson.message) {
      throw new Error(siteInfoJson.message);
    }

    const id = siteInfoJson.userid ?? 0;
    const accessKey = siteInfoJson.userprivateaccesskey ?? "";

    userData = { token: newToken, accessKey, id, privateToken: privatetoken };

    await LocalStorage.setItem("userData", JSON.stringify(userData));
  } else userData = JSON.parse(storedUserData);

  return (user = userData);
}
/**
 * 
 * @returns   return {
    token: "b7c96ea92d3da426794a038280fc5d97",
    accessKey: "0f4acb37e7bb37b1d8fa9b1314ead9ca",
    id: 18621,
  } as User;
 */
export function useUser() {
  if (user) return user;

  wrappedUser ||= wrapPromise(getUser());

  return wrappedUser.read();
}

export function getUserSync() {
  return user;
}

/**
 * Response of calls to login/token.php.
 */
type CoreSitesLoginTokenResponse = {
  token?: string;
  privatetoken?: string;
  error?: string;
  errorcode?: string;
  stacktrace?: string;
  debuginfo?: string;
  reproductionlink?: string;
};

function wrapPromise<T>(promise: Promise<T>): { read(): T } {
  let status = "pending";
  let response: T;

  const suspender = promise.then(
    (res) => {
      status = "success";
      response = res;
    },
    (err) => {
      status = "error";
      response = err;
    },
  );

  const read = () => {
    switch (status) {
      case "pending":
        throw suspender;
      case "error":
        throw response;
      default:
        return response;
    }
  };

  return { read };
}
