import { LocalStorage } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { experimental_createQueryPersister } from "@tanstack/query-persist-client-core";
import {
  QueryCache,
  QueryClient,
  useQuery,
  useSuspenseQuery,
  type UseQueryOptions,
  type UseSuspenseQueryOptions,
} from "@tanstack/react-query";
import { useUser } from "../client";
import { getUrlForService } from "../helpers";
import { WSParamsMap, WSResponseMap } from "../types/ws";

type WSQueryKey<K extends keyof WSParamsMap> = readonly [K, string, WSParamsMap[K]];

type WSQueryOptions<K extends keyof WSParamsMap, TData = WSResponseMap[K]> = Omit<
  UseQueryOptions<WSResponseMap[K], Error, TData, WSQueryKey<K>>,
  "queryKey" | "queryFn"
>;

type WSSuspenseQueryOptions<K extends keyof WSParamsMap, TData = WSResponseMap[K]> = Omit<
  UseSuspenseQueryOptions<WSResponseMap[K], Error, TData, WSQueryKey<K>>,
  "queryKey" | "queryFn"
>;

const persister = experimental_createQueryPersister({
  storage: LocalStorage,
  maxAge: 1000 * 60 * 60 * 24 * 8,
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      persister: persister.persisterFn,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.state.data === undefined) {
        showFailureToast(error, {
          primaryAction: {
            title: "Retry",
            onAction: () => query.reset(),
            // shortcut: shortcut("r"),
          },
        });
      }
    },
  }),
});

function getQueryOptions<K extends keyof WSParamsMap>(key: K, params: WSParamsMap[K], token: string) {
  const queryKey: WSQueryKey<K> = [key, token, params];
  return {
    queryKey,
    async queryFn() {
      //throw new Error("Fetching WS function: " + key);
      console.log("Fetching WS function", key, params);
      const response = await fetch(getUrlForService(key, token, params));
      return (await response.json()) as WSResponseMap[K];
    },
  };
}

export function useWSQuery<K extends keyof WSParamsMap, TData = WSResponseMap[K]>(
  key: K,
  params: WSParamsMap[K],
  options?: WSQueryOptions<K, TData>,
) {
  const { token } = useUser();
  return useQuery<WSResponseMap[K], Error, TData, WSQueryKey<K>>(
    { ...getQueryOptions(key, params, token), ...options },
    queryClient,
  );
}

export function useSuspenseWSQuery<K extends keyof WSParamsMap, TData = WSResponseMap[K]>(
  key: K,
  params: WSParamsMap[K],
  options?: WSSuspenseQueryOptions<K, TData>,
) {
  const { token } = useUser();
  return useSuspenseQuery<WSResponseMap[K], Error, TData, WSQueryKey<K>>(
    { ...getQueryOptions(key, params, token), ...options },
    queryClient,
  );
}
