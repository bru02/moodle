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
import { useCallback, useEffect, useRef } from "react";
import { getUser, refreshUserTokens } from "../client";
import { AuthError, isAuthError } from "../errors";
import { getUrlForService } from "../helpers";
import {
  getMoodleErrorCode,
  getMoodleErrorMessage,
  isExpiredTokenError,
  isMoodleErrorPayload,
} from "../helpers/moodle-errors";
import { WSParamsMap, WSResponseMap } from "../types/ws";

const PERF_DEBUG = process.env.NODE_ENV === "development";

type WSRequestResult<K extends keyof WSParamsMap> =
  | { ok: true; data: WSResponseMap[K] }
  | { ok: false; error: Error; payload?: unknown; shouldRefresh: boolean };

async function requestWSInternal<K extends keyof WSParamsMap>(
  key: K,
  token: string,
  params: WSParamsMap[K],
): Promise<WSRequestResult<K>> {
  let response: Response;
  try {
    response = await fetch(getUrlForService(key, token, params));
  } catch (e) {
    const error = e instanceof Error ? e : new Error("Network request failed");
    return { ok: false, error, shouldRefresh: false };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok || isMoodleErrorPayload(payload)) {
    const message = getMoodleErrorMessage(payload) ?? response.statusText ?? "Request failed";
    const code = getMoodleErrorCode(payload);
    const shouldRefresh = isExpiredTokenError(payload) || response.status === 401 || response.status === 403;
    const error = shouldRefresh ? new AuthError(message, { code, status: response.status }) : new Error(message);
    return { ok: false, error, payload, shouldRefresh };
  }

  return { ok: true, data: payload as WSResponseMap[K] };
}

export async function requestWS<K extends keyof WSParamsMap>(
  key: K,
  params: WSParamsMap[K],
): Promise<WSResponseMap[K]> {
  const currentUser = await getUser();
  const { token, id } = currentUser;

  const requestParams =
    "userid" in params && params.userid === 0 ? ({ ...params, userid: id } as WSParamsMap[K]) : params;

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

type WSQueryOptions<K extends keyof WSParamsMap, TData = WSResponseMap[K]> = Omit<
  UseQueryOptions<WSResponseMap[K], Error, TData, WSQueryKey<K>>,
  "queryKey" | "queryFn"
>;

type WSSuspenseQueryOptions<K extends keyof WSParamsMap, TData = WSResponseMap[K]> = Omit<
  UseSuspenseQueryOptions<WSResponseMap[K], Error, TData, WSQueryKey<K>>,
  "queryKey" | "queryFn"
>;

type AnyWSQueryKey = WSQueryKey<keyof WSParamsMap>;

const cache = new Cache({
  namespace: "ws-query-persist",
});

const persister = experimental_createQueryPersister({
  storage: {
    getItem: (key) => {
      if (!PERF_DEBUG) {
        return cache.get(key);
      }
      const label = `ws-cache:get:${key}`;
      console.time(label);
      const value = cache.get(key);
      console.timeEnd(label);
      return value;
    },
    setItem: (key, value) => {
      if (!PERF_DEBUG) {
        return cache.set(key, value);
      }
      const label = `ws-cache:set:${key}`;
      console.time(label);
      const result = cache.set(key, value);
      console.timeEnd(label);
      return result;
    },
    removeItem: (key) => {
      if (!PERF_DEBUG) {
        cache.remove(key);
        return;
      }
      const label = `ws-cache:remove:${key}`;
      console.time(label);
      cache.remove(key);
      console.timeEnd(label);
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

let fetchTimingId = 0;

function getQueryOptions<K extends keyof WSParamsMap>(key: K, params: WSParamsMap[K]) {
  const queryParams = { ...params } as WSParamsMap[K];
  const queryKey: WSQueryKey<K> = [key, queryParams];
  return {
    queryKey,
    async queryFn() {
      if (PERF_DEBUG) {
        console.log("Fetching WS function", key, queryParams);
      }
      const fetchLabel = PERF_DEBUG ? `ws-fetch:${String(key)}#${++fetchTimingId}` : "";
      if (PERF_DEBUG) {
        console.time(fetchLabel);
      }
      try {
        return await requestWS(key, queryParams);
      } finally {
        if (PERF_DEBUG) {
          console.timeEnd(fetchLabel);
        }
      }
    },
  };
}

const activeTimers = new Set<string>();
let timingId = 0;

function useQueryTiming(mode: "useQuery" | "useSuspenseQuery", queryKey: AnyWSQueryKey) {
  const labelRef = useRef<string | undefined>(undefined);
  const endedRef = useRef(false);
  const cachedStateRef = useRef(queryClient.getQueryState(queryKey));

  if (PERF_DEBUG && !labelRef.current) {
    labelRef.current = `${mode}:${String(queryKey[0])}#${++timingId}`;
    activeTimers.add(labelRef.current);
    const hasCachedData = cachedStateRef.current?.data !== undefined;
    console.time(labelRef.current);
    console.timeLog(labelRef.current, hasCachedData ? "cache present before subscribe" : "no cached data yet", {
      fetchStatus: cachedStateRef.current?.fetchStatus,
      dataUpdatedAt: cachedStateRef.current?.dataUpdatedAt,
    });
  }

  const endTiming = useCallback((note: string) => {
    if (!PERF_DEBUG) return;
    const label = labelRef.current;
    if (!label || endedRef.current || !activeTimers.has(label)) return;
    if (note) {
      console.timeLog(label, note);
    }
    console.timeEnd(label);
    activeTimers.delete(label);
    endedRef.current = true;
  }, []);

  useEffect(() => {
    return () => {
      endTiming("unmounted before resolve");
    };
  }, [endTiming]);

  return { endTiming, hasCachedData: cachedStateRef.current?.data !== undefined };
}

export function useWSQuery<K extends keyof WSParamsMap, TData = WSResponseMap[K]>(
  key: K,
  params: WSParamsMap[K],
  options?: WSQueryOptions<K, TData>,
) {
  const baseOptions = getQueryOptions(key, params);
  const { endTiming, hasCachedData } = useQueryTiming("useQuery", baseOptions.queryKey);

  const result = useQuery<WSResponseMap[K], Error, TData, WSQueryKey<K>>({ ...baseOptions, ...options }, queryClient);

  useEffect(() => {
    if (result.data !== undefined) {
      endTiming(hasCachedData ? "resolved from cache" : "resolved after fetch");
    }
  }, [endTiming, hasCachedData, result.data]);

  useEffect(() => {
    if (result.error) {
      endTiming(`errored: ${result.error.message}`);
    }
  }, [endTiming, result.error]);

  return result;
}

export function useSuspenseWSQuery<K extends keyof WSParamsMap, TData = WSResponseMap[K]>(
  key: K,
  params: WSParamsMap[K],
  options?: WSSuspenseQueryOptions<K, TData>,
) {
  const baseOptions = getQueryOptions(key, params);
  const { endTiming, hasCachedData } = useQueryTiming("useSuspenseQuery", baseOptions.queryKey);

  const result = useSuspenseQuery<WSResponseMap[K], Error, TData, WSQueryKey<K>>(
    { ...baseOptions, ...options },
    queryClient,
  );

  useEffect(() => {
    if (result.data !== undefined) {
      endTiming(hasCachedData ? "resolved from cache" : "resolved after fetch/suspense");
    }
  }, [endTiming, hasCachedData, result.data]);

  useEffect(() => {
    if (result.error) {
      endTiming("errored during suspense query");
    }
  }, [endTiming, result.error]);

  return result;
}
