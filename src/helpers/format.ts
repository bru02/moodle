import { formatDuration, formatRelative, intervalToDuration } from "date-fns";
import { enGB } from "date-fns/locale";

export function formatRelativeTime(timestampSeconds: number, now = new Date()) {
  return formatRelative(new Date(timestampSeconds * 1000), now, { locale: enGB });
}

export function formatDurationSeconds(seconds: number) {
  return formatDuration(
    intervalToDuration({
      start: 0,
      end: seconds * 1000,
    }),
  );
}

export function formatDurationBetween(startSeconds: number, endSeconds: number) {
  return formatDuration(
    intervalToDuration({
      start: new Date(startSeconds * 1000),
      end: new Date(endSeconds * 1000),
    }),
  );
}
