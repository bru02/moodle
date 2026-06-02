import { buildAutologinUrl, fetchAutologinKey } from "@moodle/core";
import { Action, ActionPanel, Cache, Color, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";

import { getUser } from "./client";
import { siteOrigin } from "./helpers/preferences";

type BrowserSession = {
  sesskey: string;
  cookies: string;
};

type UserIdentity = {
  id: number;
  fullname: string;
  username?: string;
  email?: string;
  profileimageurl?: string;
};

const cache = new Cache({ namespace: "browser-session" });
const CACHE_TTL = 10 * 60 * 1000;

function getCachedSession(): BrowserSession | null {
  const raw = cache.get("session");
  if (!raw) return null;
  try {
    const { data, expiresAt } = JSON.parse(raw) as {
      data: BrowserSession;
      expiresAt: number;
    };
    if (Date.now() > expiresAt) {
      cache.remove("session");
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedSession(data: BrowserSession) {
  cache.set(
    "session",
    JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL }),
  );
}

async function attemptAutologin(user: Awaited<ReturnType<typeof getUser>>) {
  const autologin = await fetchAutologinKey({
    siteOrigin,
    token: user.token,
    privateToken: user.privateToken!,
  });

  const autologinUrl = buildAutologinUrl({
    autologin,
    userId: user.id,
    urlToGo: `${siteOrigin}/my/`,
  });

  const response = await fetch(autologinUrl, {
    redirect: "manual",
    headers: { "User-Agent": "MoodleMobile" },
  });

  const cookies = (response.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookies) {
    throw new Error("No cookies returned from autologin");
  }

  const redirectUrl = response.headers.get("location");
  if (!redirectUrl) {
    return null;
  }

  const page = await fetch(redirectUrl, { headers: { Cookie: cookies } });
  const html = await page.text();

  const sesskey =
    html.match(/"sesskey"\s*:\s*"([^"]+)"/)?.[1] ??
    html.match(/name="sesskey"\s+value="([^"]+)"/)?.[1];
  if (!sesskey) {
    throw new Error("Failed to extract sesskey from page");
  }

  return { sesskey, cookies };
}

async function fetchBrowserSession(): Promise<BrowserSession> {
  const cached = getCachedSession();
  if (cached) return cached;
  const user = await getUser();
  if (!user.privateToken) {
    throw new Error("No privateToken available (requires HTTPS + non-admin)");
  }

  const maxAttempts = 2;
  for (let i = 0; i < maxAttempts; i++) {
    const session = await attemptAutologin(user);
    if (session) {
      setCachedSession(session);
      return session;
    }
  }

  throw new Error("No redirect from autologin.php (retried)");
}

async function searchUsers(
  query: string,
  session: BrowserSession,
): Promise<UserIdentity[]> {
  const url = `${siteOrigin}/lib/ajax/service.php?sesskey=${session.sesskey}&info=local_tdk_student_user_search_identity`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: session.cookies,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify([
      {
        index: 0,
        methodname: "local_tdk_student_user_search_identity",
        args: { query },
      },
    ]),
  });
  const json = (await res.json()) as [
    { data: unknown; error?: boolean; exception?: { message: string } },
  ];
  if (json[0].error) {
    throw new Error(json[0].exception?.message ?? "Unknown error");
  }
  const data = json[0].data;
  if (Array.isArray(data)) return data as UserIdentity[];
  if (data && typeof data === "object") {
    const first = Object.values(data).find(Array.isArray);
    if (first) return first as UserIdentity[];
  }
  return [];
}

export default function Command() {
  const [searchText, setSearchText] = useState("");

  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
    revalidate: retrySession,
  } = usePromise(fetchBrowserSession);

  const {
    data: users,
    isLoading: usersLoading,
    error: usersError,
  } = usePromise(searchUsers, [searchText, session!], {
    execute: !!session && searchText.length > 0,
  });

  const isLoading = sessionLoading || usersLoading;
  const error = sessionError ?? usersError;

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search students…"
      throttle
    >
      {error && !users?.length && (
        <List.EmptyView
          title={
            sessionError ? "Failed to fetch browser session" : "Search failed"
          }
          description={error.message}
          icon={{ source: Icon.Warning, tintColor: Color.Red }}
          actions={
            <ActionPanel>
              {sessionError && (
                <Action
                  title="Retry"
                  icon={Icon.ArrowClockwise}
                  onAction={retrySession}
                />
              )}
            </ActionPanel>
          }
        />
      )}
      {(users ?? []).map((user) => (
        <List.Item
          key={user.id}
          title={user.fullname}
          subtitle={user.email}
          icon={user.profileimageurl ?? Icon.Person}
          accessories={[{ text: user.username ?? String(user.id) }]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard
                title="Copy Username"
                content={user.username ?? ""}
              />
              <Action.CopyToClipboard
                title="Copy Name"
                content={user.fullname}
              />
              {user.email && (
                <Action.CopyToClipboard
                  title="Copy Email"
                  content={user.email}
                />
              )}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
