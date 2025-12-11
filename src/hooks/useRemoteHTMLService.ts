import { useFetch } from "@raycast/utils";
import { handleFileUrl } from "../helpers/files";
import { turndown } from "../helpers/markdown";

const urlRegex = /(?<=<a\b[^>]*\bhref\s*=\s*(['"]))(?![a-z][a-z0-9+\-.]*:|\/\/)([^'"]+)(?=\1)/gi;

export function useRemoteHTMLResource(url: string) {
  const handledUrl = handleFileUrl(url);
  const baseUrl = handledUrl.slice(0, -"index.html".length);

  return useFetch(handledUrl, {
    mapResult(r: string) {
      const md = turndown(r.replace(urlRegex, baseUrl + "$2"));

      return {
        data: md,
      };
    },
  });
}
