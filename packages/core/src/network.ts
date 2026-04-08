import type { MoodleFetchLike, MoodleResponseLike } from "./moodle-types";

export function normalizeSiteOrigin(siteOrigin: string) {
  const trimmed = siteOrigin.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  return `https://${trimmed.replace(/\/$/, "")}`;
}

export function getFetch(fetcher?: MoodleFetchLike): MoodleFetchLike {
  if (fetcher) return fetcher;
  const globalFetch = globalThis.fetch;
  if (!globalFetch) {
    throw new Error("No fetch implementation available");
  }
  return globalFetch as unknown as MoodleFetchLike;
}

export async function fetchJson(input: {
  fetcher?: MoodleFetchLike;
  url: string;
  init?: Parameters<MoodleFetchLike>[1];
}) {
  const fetcher = getFetch(input.fetcher);
  const response: MoodleResponseLike = await fetcher(input.url, input.init);
  const payload = await response.json().catch(() => undefined);
  return { response, payload };
}
