import type { MoodleIdentityProvider, MoodleSession } from "@moodle/core";

export type CredentialsLoginOptions = {
  identityProviders?: MoodleIdentityProvider[];
  siteName?: string;
};

type CredentialsLoginHandler = (
  options?: CredentialsLoginOptions,
) => Promise<MoodleSession>;

let handler: CredentialsLoginHandler | null = null;

export function setCredentialsLoginHandler(
  next: CredentialsLoginHandler | null,
) {
  handler = next;
}

export async function requestCredentialsLogin(
  options?: CredentialsLoginOptions,
): Promise<MoodleSession> {
  if (!handler) {
    throw new Error("Credentials login navigation is not ready");
  }

  return await handler(options);
}
