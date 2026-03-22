export type MoodleErrorPayload = {
  exception?: string;
  error?: string;
  errorcode?: string;
  message?: string;
};

export function isMoodleErrorPayload(payload: unknown): payload is MoodleErrorPayload {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    ("exception" in payload || "errorcode" in payload || "error" in payload || "message" in payload),
  );
}

export function getMoodleErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const error = typeof record.error === "string" ? record.error.trim() : "";
  return message || error || undefined;
}

export function getMoodleErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const code = (payload as { errorcode?: unknown }).errorcode;
  return typeof code === "string" && code.trim() ? code.trim() : undefined;
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
