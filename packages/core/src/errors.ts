export type AuthErrorOptions = {
  code?: string;
  status?: number;
  details?: string;
};
export const OFFLINE_ERROR_MESSAGE = "You appear to be offline. Moodle requests are unavailable right now.";

export class AuthError extends Error {
  code?: string;
  status?: number;
  details?: string;

  constructor(message: string, options: AuthErrorOptions = {}) {
    super(message);
    this.name = "AuthError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

export function isLikelyOfflineError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalizedMessage = message.trim().toLowerCase();
  const isLikelyOfflineTypeError =
    error instanceof TypeError &&
    /fetch failed|failed to fetch|network request failed|network error|load failed|the internet connection appears to be offline/i.test(
      message,
    );
  const isLikelyConnectivityIssue =
    /enotfound|econnrefused|econnreset|enetunreach|etimedout|getaddrinfo/i.test(normalizedMessage);

  return message === OFFLINE_ERROR_MESSAGE || isLikelyOfflineTypeError || isLikelyConnectivityIssue;
}

export function normalizeNetworkError(error: unknown): Error {
  if (error instanceof AuthError) {
    return error;
  }

  if (isLikelyOfflineError(error)) {
    return new Error(OFFLINE_ERROR_MESSAGE);
  }

  return error instanceof Error ? error : new Error("Request failed");
}
