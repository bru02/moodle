import {
  authenticateWithToken,
  authenticateWithCredentials,
  authenticateWithQrLogin,
  checkSite,
  type MoodleAccount,
  type MoodleSession,
  type StoredAccount,
  TypeOfLogin,
} from "@moodle/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";

import { QUERY_CACHE_KEY, queryClient } from "@/lib/query-client";
import { clearAllPersistentState, readAccounts, readActiveAccountId, readSecureSession, readSettings, removeSecureSession, writeAccounts, writeActiveAccountId, writeSecureSession, writeSettings } from "@/lib/storage";
import type { SessionContextValue, StoredAuthSecret } from "@/lib/mobile-types";

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: React.PropsWithChildren) {
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [draftSiteOrigin, setDraftSiteOrigin] = React.useState("");
  const [settings, setSettings] = React.useState({ mergeSimilarCourses: true });
  const [accounts, setAccounts] = React.useState<StoredAccount[]>([]);
  const [activeAccount, setActiveAccount] = React.useState<StoredAccount | null>(null);
  const [activeSession, setActiveSession] = React.useState<MoodleSession | null>(null);

  React.useEffect(() => {
    void hydrate();
  }, []);

  async function hydrate() {
    const [storedAccounts, activeAccountId, storedSettings] = await Promise.all([
      readAccounts<StoredAccount[]>(),
      readActiveAccountId(),
      readSettings(),
    ]);
    const nextAccounts = storedAccounts ?? [];
    const nextActiveAccount = nextAccounts.find((account) => account.id === activeAccountId) ?? nextAccounts[0] ?? null;
    const session = nextActiveAccount ? await buildSessionFromStorage(nextActiveAccount) : null;

    setAccounts(nextAccounts);
    setActiveAccount(nextActiveAccount);
    setActiveSession(session);
    setSettings(storedSettings);
    setIsHydrated(true);
  }

  async function signInWithCredentials(input: { siteOrigin: string; username: string; password: string }) {
    const session = await authenticateWithCredentials({
      siteOrigin: normalizeSiteOrigin(input.siteOrigin),
      username: input.username,
      password: input.password,
    });
    await saveSession(session, {
      kind: "password",
      username: input.username,
      password: input.password,
    });
    return session;
  }

  async function signInWithToken(input: { siteOrigin: string; token: string; privateToken?: string }) {
    const session = await authenticateWithToken({
      siteOrigin: normalizeSiteOrigin(input.siteOrigin),
      token: input.token,
      privateToken: input.privateToken,
    });
    await saveSession(session, { kind: "token" });
    return session;
  }

  async function signInWithQrPayload(payload: string) {
    const parsed = parseQrPayload(payload);
    console.log("[session][qr] parsed payload", {
      siteOrigin: parsed.siteOrigin,
      userId: parsed.userId,
      hasQrLoginKey: Boolean(parsed.qrLoginKey),
      qrLoginKeyLength: parsed.qrLoginKey.length,
    });

    const session = await authenticateWithQrLogin({
      siteOrigin: parsed.siteOrigin,
      qrLoginKey: parsed.qrLoginKey,
      userId: parsed.userId,
    });

    console.log("[session][qr] success", {
      siteOrigin: session.siteOrigin,
      accountId: session.account.id,
      userId: session.account.userId,
      authMethod: session.authMethod,
    });

    await saveSession(session, { kind: "token" });
    return session;
  }

  async function saveSession(session: MoodleSession, authSecret: StoredAuthSecret) {
    const storedAccount = toStoredAccount(session.account);
    const nextAccounts = [
      storedAccount,
      ...accounts.filter((account) => account.id !== storedAccount.id),
    ].map((account, index) => ({
      ...account,
      lastUsedAt: index === 0 ? Date.now() : account.lastUsedAt,
    }));

    await Promise.all([
      writeAccounts(nextAccounts),
      writeActiveAccountId(storedAccount.id),
      writeSecureSession(storedAccount.id, {
        token: session.token,
        privateToken: session.privateToken,
        accessKey: session.accessKey,
        authenticatedAt: session.authenticatedAt,
        siteInfo: session.siteInfo,
        auth: authSecret,
      }),
    ]);

    setAccounts(nextAccounts);
    setActiveAccount(storedAccount);
    setActiveSession(session);
    setDraftSiteOrigin(session.siteOrigin);
  }

  async function switchAccount(accountId: string) {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;

    const session = await buildSessionFromStorage(account);
    if (!session) return;

    await writeActiveAccountId(accountId);
    setActiveAccount(account);
    setActiveSession(session);
  }

  async function removeAccount(accountId: string) {
    const nextAccounts = accounts.filter((account) => account.id !== accountId);
    await Promise.all([writeAccounts(nextAccounts), removeSecureSession(accountId)]);

    const nextActive = activeAccount?.id === accountId ? nextAccounts[0] ?? null : activeAccount;
    await writeActiveAccountId(nextActive?.id ?? null);

    setAccounts(nextAccounts);
    setActiveAccount(nextActive);
    setActiveSession(nextActive ? await buildSessionFromStorage(nextActive) : null);
  }

  async function refreshSessionForAccount(accountId: string) {
    const account = accounts.find((item) => item.id === accountId) ?? activeAccount;
    if (!account) {
      throw new Error("Missing stored account");
    }

    const secure = await readSecureSession(account.id);
    if (!secure) {
      throw new Error("Missing secure session");
    }

    const refreshed =
      secure.auth.kind === "password"
        ? await authenticateWithCredentials({
            siteOrigin: account.siteOrigin,
            username: secure.auth.username,
            password: secure.auth.password,
          })
        : await authenticateWithToken({
            siteOrigin: account.siteOrigin,
            token: secure.token,
            privateToken: secure.privateToken,
          });

    await writeSecureSession(account.id, {
      ...secure,
      token: refreshed.token,
      privateToken: refreshed.privateToken,
      accessKey: refreshed.accessKey,
      authenticatedAt: refreshed.authenticatedAt,
      siteInfo: refreshed.siteInfo,
    });

    if (activeAccount?.id === account.id) {
      setActiveSession(refreshed);
    }

    return refreshed;
  }

  async function setMergeSimilarCourses(value: boolean) {
    const nextSettings = {
      ...settings,
      mergeSimilarCourses: value,
    };
    setSettings(nextSettings);
    await writeSettings(nextSettings);
  }

  async function clearCaches() {
    await clearAllPersistentState();
    await AsyncStorage.removeItem(QUERY_CACHE_KEY);
    queryClient.clear();
    setAccounts([]);
    setActiveAccount(null);
    setActiveSession(null);
    setDraftSiteOrigin("");
  }

  const value: SessionContextValue = {
    isHydrated,
    draftSiteOrigin,
    setDraftSiteOrigin,
    settings,
    setMergeSimilarCourses,
    accounts,
    activeAccount,
    activeSession,
    async resolveSite(input) {
      const result = await checkSite({ siteUrl: input.siteUrl });
      return {
        siteUrl: result.siteUrl,
        siteName: result.config.sitename,
        launchUrl: result.config.launchurl,
        loginType: result.code,
        showLoginForm: result.config.showloginform !== 0 || result.code === TypeOfLogin.APP,
      };
    },
    signInWithCredentials,
    signInWithToken,
    signInWithQrPayload,
    switchAccount,
    removeAccount,
    refreshSessionForAccount,
    clearCaches,
  };

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const value = React.use(SessionContext);
  if (!value) {
    throw new Error("SessionProvider is missing");
  }
  return value;
}

function toStoredAccount(account: MoodleAccount): StoredAccount {
  return {
    ...account,
    lastUsedAt: Date.now(),
  };
}

async function buildSessionFromStorage(account: StoredAccount) {
  const secure = await readSecureSession(account.id);
  if (!secure) {
    return null;
  }

  return {
    account: {
      id: account.id,
      siteOrigin: account.siteOrigin,
      userId: account.userId,
      username: account.username,
      fullname: account.fullname,
      avatarUrl: account.avatarUrl,
      authMethod: account.authMethod,
      label: account.label,
    },
    siteOrigin: account.siteOrigin,
    token: secure.token,
    privateToken: secure.privateToken,
    accessKey: secure.accessKey,
    authenticatedAt: secure.authenticatedAt,
    authMethod: account.authMethod,
    siteInfo: secure.siteInfo,
  } satisfies MoodleSession;
}

function parseQrPayload(payload: string) {
  const raw = payload.trim();
  const normalized = raw.startsWith("moodlemobile://") ? raw.slice("moodlemobile://".length) : raw;
  const url = new URL(normalized);
  const qrLoginKey = url.searchParams.get("qrlogin");
  const userId = url.searchParams.get("userid");

  if (!qrLoginKey || !userId) {
    throw new Error("QR login payload is missing qrlogin or userid");
  }

  return {
    siteOrigin: url.origin,
    qrLoginKey,
    userId,
  };
}

function normalizeSiteOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  return `https://${trimmed.replace(/\/$/, "")}`;
}
