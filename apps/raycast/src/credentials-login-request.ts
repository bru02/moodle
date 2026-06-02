import type { MoodleSession } from "@moodle/core";

type CredentialsLoginHandler = () => Promise<MoodleSession>;

let handler: CredentialsLoginHandler | null = null;

export function setCredentialsLoginHandler(
  next: CredentialsLoginHandler | null,
) {
  handler = next;
}

export async function requestCredentialsLogin(): Promise<MoodleSession> {
  if (!handler) {
    throw new Error("Credentials login navigation is not ready");
  }

  return await handler();
}
