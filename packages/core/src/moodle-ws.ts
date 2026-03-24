import { executeMoodleWSRequest } from "./request";

export async function callMoodleWS<T>(params: {
  origin: string;
  token: string;
  wsfunction: string;
  requestParams?: Record<string, string | number | boolean>;
}): Promise<T> {
  const result = await executeMoodleWSRequest<T>({
    siteOrigin: params.origin,
    token: params.token,
    service: params.wsfunction,
    requestParams: params.requestParams ?? {},
  });

  if (!result.ok) {
    throw result.error;
  }

  return result.data;
}
