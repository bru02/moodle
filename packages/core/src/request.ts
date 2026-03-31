import { AuthError, normalizeNetworkError } from "./errors";
import { getMoodleErrorCode, getMoodleErrorMessage, isExpiredTokenError, isMoodleErrorPayload } from "./moodle-errors";
import { type MoodleFetchLike, type MoodleResponseLike, type MoodleSession } from "./moodle-types";
import { buildMoodleWSUrl, normalizeRequestParams } from "./utils";

export type RequestResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: Error; payload?: unknown; shouldRefresh: boolean };

export type RequestLimiter = ReturnType<typeof createRequestLimiter>;

export type MoodleWSRequestInput = {
  siteOrigin?: string;
  token?: string;
  session?: MoodleSession;
  service: string;
  requestParams?: Record<string, unknown>;
  fetcher?: MoodleFetchLike;
  limiter?: RequestLimiter;
  refreshSession?: (session: MoodleSession) => Promise<MoodleSession>;
};

function normalizeSiteOrigin(siteOrigin: string) {
  return siteOrigin.replace(/\/$/, "");
}

function getFetch(fetcher?: MoodleFetchLike): MoodleFetchLike {
  if (fetcher) return fetcher;
  const globalFetch = globalThis.fetch;
  if (!globalFetch) {
    throw new Error("No fetch implementation available");
  }
  return globalFetch as unknown as MoodleFetchLike;
}

async function requestOnce<T>(input: {
  siteOrigin: string;
  service: string;
  token: string;
  requestParams: Record<string, unknown>;
  fetcher?: MoodleFetchLike;
  limiter?: RequestLimiter;
}): Promise<RequestResult<T>> {
  const run = input.limiter?.run ?? (async <TValue>(fn: () => Promise<TValue>) => await fn());

  return await run(async () => {
    let response: MoodleResponseLike;
    try {
      response = await getFetch(input.fetcher)(
        buildMoodleWSUrl({
          siteOrigin: input.siteOrigin,
          service: input.service,
          token: input.token,
          requestParams: normalizeRequestParams(input.requestParams),
        }),
      );
    } catch (error) {
      return {
        ok: false,
        error: normalizeNetworkError(error),
        shouldRefresh: false,
      };
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

    return { ok: true, data: payload as T };
  });
}

export async function executeMoodleWSRequest<T>(input: MoodleWSRequestInput): Promise<RequestResult<T>> {
  const session = input.session;
  const siteOrigin = normalizeSiteOrigin(session?.siteOrigin ?? input.siteOrigin ?? "");
  const token = session?.token ?? input.token;

  if (!siteOrigin) {
    throw new Error("Missing Moodle site origin");
  }

  if (!token) {
    throw new Error("Missing Moodle token");
  }

  const initialResult = await requestOnce<T>({
    siteOrigin,
    service: input.service,
    token,
    requestParams: input.requestParams ?? {},
    fetcher: input.fetcher,
    limiter: input.limiter,
  });

  if (!initialResult.ok && initialResult.shouldRefresh && session && input.refreshSession) {
    const refreshedSession = await input.refreshSession(session);
    return await requestOnce<T>({
      siteOrigin: normalizeSiteOrigin(refreshedSession.siteOrigin),
      service: input.service,
      token: refreshedSession.token,
      requestParams: input.requestParams ?? {},
      fetcher: input.fetcher,
      limiter: input.limiter,
    });
  }

  return initialResult;
}

export function createRequestLimiter(maxConcurrentRequests = 4) {
  let activeRequests = 0;
  const pendingResumes: Array<() => void> = [];

  async function acquire() {
    if (activeRequests < maxConcurrentRequests) {
      activeRequests++;
      return;
    }

    await new Promise<void>((resolve) => {
      pendingResumes.push(() => {
        activeRequests++;
        resolve();
      });
    });
  }

  function release() {
    activeRequests = Math.max(0, activeRequests - 1);
    const resume = pendingResumes.shift();
    resume?.();
  }

  return {
    async run<T>(fn: () => Promise<T>) {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

export function buildMoodleWSQueryKey(service: string, requestParams: Record<string, unknown> = {}) {
  return [service, normalizeRequestParams(requestParams)] as const;
}

export function buildMoodleWSBatchQueryKey(service: string, requestParamsList: readonly Record<string, unknown>[]) {
  return [service, "batch", requestParamsList.map((params) => normalizeRequestParams(params))] as const;
}

export const moodleQueryKeys = {
  auth(siteOrigin: string, userId: number) {
    return ["moodle", "auth", normalizeSiteOrigin(siteOrigin), userId] as const;
  },
  siteInfo(siteOrigin: string, userId?: number) {
    return ["moodle", "site-info", normalizeSiteOrigin(siteOrigin), userId ?? null] as const;
  },
  courses(siteOrigin: string, userId: number, mergeSimilarCourses: boolean) {
    return ["moodle", "courses", normalizeSiteOrigin(siteOrigin), userId, mergeSimilarCourses] as const;
  },
  courseContents(siteOrigin: string, courseIds: readonly number[]) {
    return ["moodle", "course-contents", normalizeSiteOrigin(siteOrigin), ...courseIds] as const;
  },
  tasks(siteOrigin: string, userId: number) {
    return ["moodle", "tasks", normalizeSiteOrigin(siteOrigin), userId] as const;
  },
  ws(service: string, requestParams: Record<string, unknown> = {}) {
    return ["moodle", "ws", service, normalizeRequestParams(requestParams)] as const;
  },
  wsBatch(service: string, requestParamsList: readonly Record<string, unknown>[]) {
    return ["moodle", "ws-batch", service, requestParamsList.map((params) => normalizeRequestParams(params))] as const;
  },
};
