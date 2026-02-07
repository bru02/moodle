import type { CoreWSErrorData } from "../types";

export type MoodleErrorPayload = Partial<CoreWSErrorData> & {
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
  const p = payload as Record<string, unknown>;
  const message = typeof p.message === "string" ? p.message.trim() : "";
  const error = typeof p.error === "string" ? p.error.trim() : "";
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
    const msg = getMoodleErrorMessage(payload)?.toLowerCase() ?? "";
    return msg.includes("invalid token") && msg.includes("expired");
  }
  return false;
}
