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
import { getUser } from "../client";
import { getUrlForService } from "../helpers";
import { WSParamsMap, WSResponseMap } from "../types/ws";

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
      const label = `ws-cache:get:${key}`;
      console.time(label);
      const value = cache.get(key);
      console.timeEnd(label);
      return value;
    },
    setItem: (key, value) => {
      const label = `ws-cache:set:${key}`;
      console.time(label);
      const result = cache.set(key, value);
      console.timeEnd(label);
      return result;
    },
    removeItem: (key) => {
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

function getQueryOptions<K extends keyof WSParamsMap>(key: K, params: WSParamsMap[K]) {
  const queryKey: WSQueryKey<K> = [key, params];
  return {
    queryKey,
    async queryFn() {
      const { token, id } = await getUser();

      if ("userid" in params && params.userid === 0) {
        params.userid = id;
      }
      //throw new Error("Fetching WS function: " + key);
      console.log("Fetching WS function", key, params);
      const fetchLabel = `ws-fetch:${String(key)}`;
      console.time(fetchLabel);
      const response = await fetch(getUrlForService(key, token, params));
      const json = (await response.json()) as WSResponseMap[K];
      console.timeEnd(fetchLabel);
      return json;
    },
  };
}

const activeTimers = new Set<string>();
let timingId = 0;

function useQueryTiming(mode: "useQuery" | "useSuspenseQuery", queryKey: AnyWSQueryKey) {
  const labelRef = useRef<string | undefined>(undefined);
  const endedRef = useRef(false);
  const cachedStateRef = useRef(queryClient.getQueryState(queryKey));

  if (!labelRef.current) {
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
