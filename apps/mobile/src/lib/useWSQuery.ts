import {
  createMoodleWSClient,
  createWSRequestLimiter,
} from "@moodle/core";
import {
  queryOptions,
  useQueries,
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";

import type { MoodleSession } from "./moodle-types";

type WSAdapter = {
  siteOrigin: string;
  session: MoodleSession;
  refreshSession: () => Promise<MoodleSession | null>;
};

type WSRequestParams = Record<string, unknown>;

const wsRequestLimiter = createWSRequestLimiter(4);

function createWSClient(adapter: WSAdapter) {
  return createMoodleWSClient({
    getSession: async () => adapter.session,
    getSiteOrigin: () => adapter.siteOrigin,
    getToken: (session) => session.token,
    refreshSession: async () => {
      const refreshed = await adapter.refreshSession();
      if (!refreshed) {
        throw new Error("Unable to refresh Moodle session");
      }
      return refreshed;
    },
    resolveRequestParams: ({ params, session }) =>
      "userid" in params && params.userid === 0 ? { ...params, userid: session.userId } : params,
    limiter: wsRequestLimiter,
  });
}

function normalizeSiteOrigin(siteOrigin: string) {
  return siteOrigin.replace(/\/$/, "");
}

function buildScopedWSQueryKey(adapter: WSAdapter, service: string, params: WSRequestParams = {}) {
  return [
    "moodle",
    "ws",
    normalizeSiteOrigin(adapter.siteOrigin),
    adapter.session.userId,
    service,
    params,
  ] as const;
}

function buildScopedWSBatchQueryKey(
  adapter: WSAdapter,
  service: string,
  paramsList: readonly WSRequestParams[],
) {
  return [
    "moodle",
    "ws-batch",
    normalizeSiteOrigin(adapter.siteOrigin),
    adapter.session.userId,
    service,
    paramsList,
  ] as const;
}

export async function requestWS<T>(
  adapter: WSAdapter,
  service: string,
  params: WSRequestParams = {},
) {
  return await createWSClient(adapter).request<T>(service, params as Record<string, string | number | boolean>);
}

export function buildWSQueryOptions<T>(
  adapter: WSAdapter,
  service: string,
  params: WSRequestParams = {},
) {
  const client = createWSClient(adapter);
  const queryParams = params as Record<string, string | number | boolean>;

  return queryOptions<T>({
    ...client.getQueryOptions<T>(service, queryParams),
    queryKey: buildScopedWSQueryKey(adapter, service, queryParams),
  });
}

export function buildWSBatchQueryOptions<T>(
  adapter: WSAdapter,
  service: string,
  paramsList: readonly WSRequestParams[],
) {
  const client = createWSClient(adapter);
  const queryParamsList = paramsList as unknown as readonly Record<string, string | number | boolean>[];

  return queryOptions<T[]>({
    ...client.getBatchQueryOptions<T>(service, queryParamsList),
    queryKey: buildScopedWSBatchQueryKey(adapter, service, queryParamsList),
  });
}

type WSQueryOptions<TData = unknown> = Omit<
  UseQueryOptions<unknown, Error, TData>,
  "queryKey" | "queryFn"
>;

export function useWSQuery<TData = unknown>(
  adapter: WSAdapter | null,
  service: string,
  params: WSRequestParams = {},
  options?: WSQueryOptions<TData>,
) {
  return useQuery({
    ...(adapter ? buildWSQueryOptions<unknown>(adapter, service, params) : { queryKey: ["moodle", "ws", "empty", service, params] as const }),
    ...options,
    enabled: Boolean(adapter) && (options?.enabled ?? true),
  });
}

export function useWSQueries<TData = unknown>(
  adapter: WSAdapter | null,
  requests: readonly {
    service: string;
    params?: WSRequestParams;
  }[],
) {
  return useQueries({
    queries: adapter
      ? requests.map((request) =>
          buildWSQueryOptions<TData>(
            adapter,
            request.service,
            request.params ?? {},
          ),
        )
      : [],
  });
}

export type { WSAdapter, WSRequestParams };
