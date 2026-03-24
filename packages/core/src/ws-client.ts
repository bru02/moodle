import { buildMoodleWSBatchQueryKey, buildMoodleWSQueryKey, createRequestLimiter, executeMoodleWSRequest, type RequestResult } from "./request";
import type { RequestParams } from "./utils";

export const createWSRequestLimiter = createRequestLimiter;

type Primitive = string | number | boolean;
type WSRequestParams = Record<string, Primitive>;

type RequestParamsResolver<TSession> = (input: {
  service: string;
  params: WSRequestParams;
  session: TSession;
}) => WSRequestParams;

export function createMoodleWSClient<TSession>(input: {
  getSession: () => Promise<TSession>;
  getSiteOrigin: (session: TSession) => string;
  getToken: (session: TSession) => string;
  refreshSession?: (session: TSession) => Promise<TSession>;
  resolveRequestParams?: RequestParamsResolver<TSession>;
  limiter?: ReturnType<typeof createWSRequestLimiter>;
}) {
  async function request<T>(service: string, requestParams: WSRequestParams = {}): Promise<T> {
    const session = await input.getSession();
    const resolvedParams = input.resolveRequestParams
      ? input.resolveRequestParams({
          service,
          params: requestParams,
          session,
        })
      : requestParams;

    const initialResult = await executeMoodleWSRequest<T>({
      siteOrigin: input.getSiteOrigin(session),
      token: input.getToken(session),
      service,
      requestParams: resolvedParams,
      limiter: input.limiter,
    });

    if (initialResult.ok) {
      return initialResult.data;
    }

    if (initialResult.shouldRefresh && input.refreshSession) {
      const refreshedSession = await input.refreshSession(session);
      const retryResult = await executeMoodleWSRequest<T>({
        siteOrigin: input.getSiteOrigin(refreshedSession),
        token: input.getToken(refreshedSession),
        service,
        requestParams: input.resolveRequestParams
          ? input.resolveRequestParams({
              service,
              params: requestParams,
              session: refreshedSession,
            })
          : requestParams,
        limiter: input.limiter,
      });

      if (retryResult.ok) {
        return retryResult.data;
      }

      throw retryResult.error;
    }

    throw initialResult.error;
  }

  function getQueryOptions<T>(service: string, requestParams: WSRequestParams = {}) {
    const queryParams = { ...requestParams };

    return {
      queryKey: buildMoodleWSQueryKey(service, queryParams),
      queryFn: async () => await request<T>(service, queryParams),
    };
  }

  function getBatchQueryOptions<T>(service: string, requestParamsList: readonly WSRequestParams[]) {
    const queryParams = requestParamsList.map((params) => ({ ...params }));

    return {
      queryKey: buildMoodleWSBatchQueryKey(service, queryParams),
      queryFn: async () => await Promise.all(queryParams.map(async (params) => await request<T>(service, params))),
    };
  }

  return {
    request,
    getQueryOptions,
    getBatchQueryOptions,
  };
}

export async function requestMoodleWS<T>(params: {
  siteOrigin: string;
  service: string;
  token: string;
  requestParams?: Record<string, unknown>;
  limiter?: ReturnType<typeof createWSRequestLimiter>;
}): Promise<RequestResult<T>> {
  return await executeMoodleWSRequest<T>({
    siteOrigin: params.siteOrigin,
    token: params.token,
    service: params.service,
    requestParams: params.requestParams ?? {},
    limiter: params.limiter,
  });
}

export type { RequestParams };
