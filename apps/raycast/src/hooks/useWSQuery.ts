import { createMoodleWSClient, createRequestLimiter, isAuthError, isLikelyOfflineError } from "@moodle/core";
import { Cache } from "@raycast/api";
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

import { getUser, refreshUserTokens } from "../client";
import { siteOrigin } from "../helpers/preferences";
import { WSParamsMap, WSResponseMap } from "../types/ws";

type Primitive = string | number | boolean;
type RequestParams = Record<string, Primitive>;
const wsRequestLimiter = createRequestLimiter(4);

const wsClient = createMoodleWSClient({
  getSession: getUser,
  getSiteOrigin: () => siteOrigin,
  getToken: (session) => session.token,
  refreshSession: async () => await refreshUserTokens(),
  limiter: wsRequestLimiter,
  resolveRequestParams: ({ params, session }) =>
    "userid" in params && params.userid === 0 ? { ...params, userid: session.id } : params,
});

export async function requestWS<K extends keyof WSParamsMap>(
  key: K,
  params: WSParamsMap[K],
): Promise<WSResponseMap[K]> {
  return await wsClient.request<WSResponseMap[K]>(key, params as RequestParams);
}

type WSQueryKey<K extends keyof WSParamsMap> = readonly [K, WSParamsMap[K]];
type WSBatchQueryKey<K extends keyof WSParamsMap> = readonly [K, "batch", readonly WSParamsMap[K][]];

type WSQueryOptions<K extends keyof WSParamsMap, TData = WSResponseMap[K]> = Omit<
  UseQueryOptions<WSResponseMap[K], Error, TData, WSQueryKey<K>>,
  "queryKey" | "queryFn"
>;

type WSSuspenseQueryOptions<K extends keyof WSParamsMap, TData = WSResponseMap[K]> = Omit<
  UseSuspenseQueryOptions<WSResponseMap[K], Error, TData, WSQueryKey<K>>,
  "queryKey" | "queryFn"
>;

type WSBatchQueryOptions<K extends keyof WSParamsMap, TData = WSResponseMap[K][]> = Omit<
  UseQueryOptions<WSResponseMap[K][], Error, TData, WSBatchQueryKey<K>>,
  "queryKey" | "queryFn"
>;

const cache = new Cache({
  namespace: "ws-query-persist",
});

const persister = experimental_createQueryPersister({
  storage: {
    getItem: (key) => cache.get(key),
    setItem: (key, value) => cache.set(key, value),
    removeItem: (key) => {
      cache.remove(key);
    },
  },
  maxAge: 1000 * 60 * 60 * 24 * 8,
  refetchOnRestore: "always",
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      persister: persister.persisterFn,
      retry: (failureCount, error) => {
        if (isAuthError(error)) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isAuthError(error)) {
        return;
      }
      if (query.state.data === undefined || isLikelyOfflineError(error)) {
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

function getQueryOptions<K extends keyof WSParamsMap>(key: K, params: WSParamsMap[K]) {
  return wsClient.getQueryOptions<WSResponseMap[K]>(key, params as RequestParams) as {
    queryKey: WSQueryKey<K>;
    queryFn: () => Promise<WSResponseMap[K]>;
  };
}

function getBatchQueryOptions<K extends keyof WSParamsMap>(key: K, paramsList: readonly WSParamsMap[K][]) {
  return wsClient.getBatchQueryOptions<WSResponseMap[K]>(key, paramsList as readonly RequestParams[]) as unknown as {
    queryKey: WSBatchQueryKey<K>;
    queryFn: () => Promise<WSResponseMap[K][]>;
  };
}

export function useWSQuery<K extends keyof WSParamsMap, TData = WSResponseMap[K]>(
  key: K,
  params: WSParamsMap[K],
  options?: WSQueryOptions<K, TData>,
) {
  const baseOptions = getQueryOptions(key, params);
  return useQuery<WSResponseMap[K], Error, TData, WSQueryKey<K>>({ ...baseOptions, ...options }, queryClient);
}

export function useWSBatchQuery<K extends keyof WSParamsMap, TData = WSResponseMap[K][]>(
  key: K,
  paramsList: readonly WSParamsMap[K][],
  options?: WSBatchQueryOptions<K, TData>,
) {
  const baseOptions = getBatchQueryOptions(key, paramsList);
  return useQuery<WSResponseMap[K][], Error, TData, WSBatchQueryKey<K>>({ ...baseOptions, ...options }, queryClient);
}

export function useSuspenseWSQuery<K extends keyof WSParamsMap, TData = WSResponseMap[K]>(
  key: K,
  params: WSParamsMap[K],
  options?: WSSuspenseQueryOptions<K, TData>,
) {
  const baseOptions = getQueryOptions(key, params);
  return useSuspenseQuery<WSResponseMap[K], Error, TData, WSQueryKey<K>>({ ...baseOptions, ...options }, queryClient);
}
