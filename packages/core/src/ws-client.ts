import { AuthError } from "./errors";
import { getMoodleErrorCode, getMoodleErrorMessage, isExpiredTokenError, isMoodleErrorPayload } from "./moodle-errors";
import { buildMoodleWSUrl, normalizeRequestParams, type RequestParams } from "./utils";

type RequestResult<T> = { ok: true; data: T } | { ok: false; error: Error; payload?: unknown; shouldRefresh: boolean };

export function createWSRequestLimiter(maxConcurrentRequests = 4) {
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

export async function requestMoodleWS<T>(params: {
  siteOrigin: string;
  service: string;
  token: string;
  requestParams?: Record<string, unknown>;
  limiter?: ReturnType<typeof createWSRequestLimiter>;
}): Promise<RequestResult<T>> {
  const { siteOrigin, service, token, requestParams = {}, limiter } = params;
  const run = limiter?.run ?? (async <TValue>(fn: () => Promise<TValue>) => await fn());

  return run(async () => {
    let response: Response;

    try {
      response = await fetch(
        buildMoodleWSUrl({
          siteOrigin,
          service,
          token,
          requestParams: normalizeRequestParams(requestParams),
        }),
      );
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error : new Error("Network request failed"),
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

export type { RequestParams };
