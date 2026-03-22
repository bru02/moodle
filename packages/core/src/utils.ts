import { decode } from "html-entities";

export type Primitive = string | number | boolean;
export type RequestParams = Record<string, Primitive>;

export function stripHTML(html: string) {
  return decode(html.replace(/<[^>]+>/g, "")).trim();
}

export function buildMoodleWSUrl(params: {
  siteOrigin: string;
  service: string;
  token: string;
  requestParams?: Record<string, Primitive>;
}) {
  const { siteOrigin, service, token, requestParams = {} } = params;
  return `${siteOrigin}/webservice/rest/server.php?${new URLSearchParams({
    wsfunction: service,
    ...requestParams,
    wstoken: token,
    moodlewssettinglang: "en",
    moodlewsrestformat: "json",
  })}`;
}

export function normalizeRequestParams(input: Record<string, unknown>): RequestParams {
  const output: RequestParams = {};

  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        const item = value[index];
        if (item == null) continue;
        if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
          output[`${key}[${index}]`] = item;
        }
      }
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
    }
  }

  return output;
}
