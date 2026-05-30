export type MoodleErrorPayload = {
  exception?: unknown;
  error?: unknown;
  errorcode?: unknown;
  message?: unknown;
};

export function isMoodleErrorPayload(
  payload: unknown,
): payload is MoodleErrorPayload {
  if (Array.isArray(payload)) {
    return payload.some((entry) => isMoodleErrorPayload(entry));
  }

  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  if (record.error === true) {
    return true;
  }

  return Boolean(
    getMoodleErrorMessage(payload) ||
      getMoodleErrorCode(payload) ||
      "exception" in record ||
      "error" in record ||
      "message" in record ||
      "errorcode" in record,
  );
}

export function getMoodleErrorMessage(payload: unknown): string | undefined {
  for (const record of iterateErrorRecords(payload)) {
    const message =
      typeof record.message === "string" ? record.message.trim() : "";
    if (message) {
      return message;
    }

    const error = typeof record.error === "string" ? record.error.trim() : "";
    if (error) {
      return error;
    }

    const exception =
      typeof record.exception === "string" ? record.exception.trim() : "";
    if (exception) {
      return exception;
    }
  }

  return undefined;
}

export function getMoodleErrorCode(payload: unknown): string | undefined {
  for (const record of iterateErrorRecords(payload)) {
    const code = record.errorcode;
    if (typeof code === "string" && code.trim()) {
      return code.trim();
    }
  }

  return undefined;
}

export function getMoodleExceptionMessage(payload: unknown): string | undefined {
  for (const record of iterateErrorRecords(payload)) {
    const exception = record.exception;
    if (!exception || typeof exception !== "object") {
      continue;
    }

    const message = (exception as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return undefined;
}

export function isExpiredTokenError(payload: unknown): boolean {
  const code = getMoodleErrorCode(payload)?.toLowerCase();
  if (code === "invalidtoken") return true;
  if (code === "accessexception") {
    const message = getMoodleErrorMessage(payload)?.toLowerCase() ?? "";
    return message.includes("invalid token") && message.includes("expired");
  }
  return false;
}

function* iterateErrorRecords(payload: unknown): Generator<Record<string, unknown>> {
  const queue: unknown[] = [payload];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const record = current as Record<string, unknown>;
    yield record;

    if (record.exception && typeof record.exception === "object") {
      queue.push(record.exception);
    }

    if (record.data && typeof record.data === "object") {
      queue.push(record.data);
    }
  }
}
