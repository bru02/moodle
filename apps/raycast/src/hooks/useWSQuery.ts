import { createWSRequestLimiter, isAuthError, requestMoodleWS } from "@moodle/core";
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

type WSRequestResult<K extends keyof WSParamsMap> =
  | { ok: true; data: WSResponseMap[K] }
  | { ok: false; error: Error; payload?: unknown; shouldRefresh: boolean };

type Primitive = string | number | boolean;
type RequestParams = Record<string, Primitive>;
const wsRequestLimiter = createWSRequestLimiter(4);

async function requestWSInternal<K extends keyof WSParamsMap>(
  key: K,
  token: string,
  params: RequestParams,
): Promise<WSRequestResult<K>> {
  const result = await requestMoodleWS<WSResponseMap[K]>({
    siteOrigin,
    service: key,
    token,
    requestParams: params,
    limiter: wsRequestLimiter,
  });
  if (result.ok) {
    return result;
  }
  return result;
}

export async function requestWS<K extends keyof WSParamsMap>(
  key: K,
  params: WSParamsMap[K],
): Promise<WSResponseMap[K]> {
  const currentUser = await getUser();
  const { token, id } = currentUser;
  const requestParamsSource =
    "userid" in params && params.userid === 0 ? ({ ...params, userid: id } as WSParamsMap[K]) : params;
  const requestParams = requestParamsSource as RequestParams;

  let result = await requestWSInternal(key, token, requestParams);
  if (!result.ok && result.shouldRefresh) {
    const refreshed = await refreshUserTokens();
    result = await requestWSInternal(key, refreshed.token, requestParams);
  }
  if (!result.ok) {
    throw result.error;
  }
  return result.data;
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

function getQueryOptions<K extends keyof WSParamsMap>(key: K, params: WSParamsMap[K]) {
  const queryParams = { ...params } as WSParamsMap[K];
  const queryKey: WSQueryKey<K> = [key, queryParams];
  return {
    queryKey,
    async queryFn() {
      return await requestWS(key, queryParams);
    },
  };
}

function getBatchQueryOptions<K extends keyof WSParamsMap>(key: K, paramsList: readonly WSParamsMap[K][]) {
  const queryParams = paramsList.map((params) => ({ ...params })) as readonly WSParamsMap[K][];
  const queryKey: WSBatchQueryKey<K> = [key, "batch", queryParams];
  return {
    queryKey,
    async queryFn() {
      return await Promise.all(queryParams.map((params) => requestWS(key, params)));
    },
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
