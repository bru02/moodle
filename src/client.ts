import { Cache, LocalStorage } from "@raycast/api";
import { getUrlForService } from "./helpers";
import { isQrAuth, preferences, siteHostname, siteUrl } from "./helpers/preferences";
let user: User | null = null;
const wrappedUser = wrapPromise(fetchUser());
const cache = new Cache({ namespace: "user" });

interface User {
  token: string;
  privateToken?: string;
  accessKey: string;
  id: number;
}

async function loginUserPass() {
  const tokenResp = await fetch(`${siteHostname}/login/token.php?lang=en`, {
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

  return (await tokenResp.json()) as CoreSitesLoginTokenResponse;
}

async function loginQr() {
  console.log(siteHostname);
  const tokenResp = await fetch(
    `${siteHostname}/lib/ajax/service-nologin.php?info=tool_mobile_get_tokens_for_qr_login&lang=en`,
    {
      method: "POST",
      body: JSON.stringify([
        {
          index: 0,
          methodname: "tool_mobile_get_tokens_for_qr_login",
          args: {
            qrloginkey: siteUrl.searchParams.get("qrlogin"),
            userid: siteUrl.searchParams.get("userid"),
          },
        },
      ]),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MoodleMobile",
      },
    },
  );

  return (await tokenResp.json()) as CoreSitesLoginTokenResponse;
}

async function fetchUser() {
  const cachedUserData = cache?.get("userData");
  if (!user && cachedUserData) {
    try {
      user = JSON.parse(cachedUserData) as User;
    } catch {
      cache.remove("userData");
    }
  }

  let userData: User | null = null;

  console.time("fetchUser");
  const storedUserData = await LocalStorage.getItem<string>("userData");
  console.timeEnd("fetchUser");

  if (storedUserData) {
    try {
      userData = JSON.parse(storedUserData) as User;
    } catch {
      userData = null;
    }
  }

  if (!userData && user) {
    userData = user;
  }

  if (!userData) {
    console.log("isQrAuth:", isQrAuth);
    let tokenJson = isQrAuth ? await loginQr() : await loginUserPass();

    console.log("Raw tokenJson:", JSON.stringify(tokenJson, null, 2));

    if (Array.isArray(tokenJson)) {
      tokenJson = tokenJson[0].data;
      console.log("Extracted from array:", JSON.stringify(tokenJson, null, 2));
    }

    if (!tokenJson?.token) throw new Error(tokenJson?.error || "Failed to fetch token");
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
  }

  if (!userData) {
    throw new Error("Failed to load user data");
  }

  user = userData;
  const serializedUser = JSON.stringify(userData);

  cache.set("userData", serializedUser);
  await LocalStorage.setItem("userData", serializedUser);

  console.log("Final userData:", userData);

  return userData;
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
  return wrappedUser.read();
}

export function getUser() {
  return wrappedUser.promise;
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

function wrapPromise<T>(promise: Promise<T>): { read(): T; promise: Promise<T> } {
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

  return { read, promise };
}
