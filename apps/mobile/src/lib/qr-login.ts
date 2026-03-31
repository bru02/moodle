export type ParsedQrLogin = {
  siteUrl: string;
  qrLoginKey: string;
  userId: string;
};

export function parseMoodleQrLoginPayload(payload: string): ParsedQrLogin {
  const normalized = payload.startsWith("moodlemobile://")
    ? payload.slice("moodlemobile://".length)
    : payload;
  const url = new URL(normalized);
  const siteUrl = url.origin;
  const qrLoginKey = url.searchParams.get("qrlogin") ?? "";
  const userId = url.searchParams.get("userid") ?? "";

  if (!siteUrl || !qrLoginKey || !userId) {
    throw new Error("Invalid Moodle QR code.");
  }

  return { siteUrl, qrLoginKey, userId };
}
