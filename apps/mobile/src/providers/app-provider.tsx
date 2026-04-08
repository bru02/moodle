import React from "react";

import { SessionProvider, useSession } from "@/providers/session-provider";
import type { MoodleAccount, MoodleSession } from "@/lib/moodle-types";

type CredentialsInput = {
  siteUrl: string;
  username: string;
  password: string;
};

type QrInput = {
  siteUrl: string;
  qrLoginKey: string;
  userId: string;
};

type AppContextValue = {
  ready: boolean;
  accounts: MoodleAccount[];
  activeAccountId: string | null;
  activeAccount: MoodleAccount | null;
  settings: {
    mergeSimilarCourses: boolean;
  };
  setActiveAccount(id: string | null): Promise<void>;
  removeAccount(id: string): Promise<void>;
  resolveSite(input: { siteUrl: string }): Promise<{
    siteUrl: string;
    siteName?: string;
    launchUrl?: string;
    loginType: number;
    showLoginForm: boolean;
  }>;
  addCredentialAccount(input: CredentialsInput): Promise<void>;
  addTokenAccount(input: { siteUrl: string; token: string; privateToken?: string }): Promise<void>;
  addQrAccount(input: QrInput): Promise<void>;
  refreshAccountSession(id: string): Promise<MoodleSession | null>;
  updateSettings(next: Partial<{ mergeSimilarCourses: boolean }>): Promise<void>;
  accountSession(id: string): MoodleSession | null;
};

const AppContext = React.createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppProviderBridge>{children}</AppProviderBridge>
    </SessionProvider>
  );
}

function AppProviderBridge({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const {
    accounts,
    activeAccount,
    activeSession,
    isHydrated,
    settings,
    switchAccount,
    removeAccount: removeStoredAccount,
    resolveSite: resolveStoredSite,
    signInWithCredentials,
    signInWithToken,
    signInWithQrPayload,
    refreshSessionForAccount,
    setMergeSimilarCourses,
  } = session;
  const mappedAccounts = React.useMemo(() => accounts.map(mapAccount), [accounts]);
  const mappedActiveAccount = React.useMemo(
    () => (activeAccount ? mapAccount(activeAccount) : null),
    [activeAccount],
  );
  const mappedActiveSession = React.useMemo(() => mapSession(activeSession), [activeSession]);

  const setActiveAccount = React.useCallback(async (id: string | null) => {
    if (!id) {
      return;
    }
    await switchAccount(id);
  }, [switchAccount]);

  const removeAccount = React.useCallback(async (id: string) => {
    await removeStoredAccount(id);
  }, [removeStoredAccount]);

  const resolveSite = React.useCallback(async (input: { siteUrl: string }) => {
    return await resolveStoredSite(input);
  }, [resolveStoredSite]);

  const addCredentialAccount = React.useCallback(async (input: CredentialsInput) => {
    await signInWithCredentials({
      siteOrigin: input.siteUrl,
      username: input.username,
      password: input.password,
    });
  }, [signInWithCredentials]);

  const addTokenAccount = React.useCallback(async (input: { siteUrl: string; token: string; privateToken?: string }) => {
    await signInWithToken({
      siteOrigin: input.siteUrl,
      token: input.token,
      privateToken: input.privateToken,
    });
  }, [signInWithToken]);

  const addQrAccount = React.useCallback(async (input: QrInput) => {
    const payload = `${normalizeSiteUrl(input.siteUrl)}?qrlogin=${encodeURIComponent(input.qrLoginKey)}&userid=${encodeURIComponent(input.userId)}`;
    await signInWithQrPayload(payload);
  }, [signInWithQrPayload]);

  const refreshAccountSession = React.useCallback(async (id: string) => {
    const refreshed = await refreshSessionForAccount(id);
    return mapSession(refreshed);
  }, [refreshSessionForAccount]);

  const updateSettings = React.useCallback(async (next: Partial<{ mergeSimilarCourses: boolean }>) => {
    if (typeof next.mergeSimilarCourses === "boolean") {
      await setMergeSimilarCourses(next.mergeSimilarCourses);
    }
  }, [setMergeSimilarCourses]);

  const accountSession = React.useCallback((id: string) => {
    if (mappedActiveAccount?.id !== id) {
      return null;
    }
    return mappedActiveSession;
  }, [mappedActiveAccount?.id, mappedActiveSession]);

  const value = React.useMemo<AppContextValue>(() => {
    return {
      ready: isHydrated,
      accounts: mappedAccounts,
      activeAccountId: mappedActiveAccount?.id ?? null,
      activeAccount: mappedActiveAccount,
      settings,
      setActiveAccount,
      removeAccount,
      resolveSite,
      addCredentialAccount,
      addTokenAccount,
      addQrAccount,
      refreshAccountSession,
      updateSettings,
      accountSession,
    };
  }, [
    accountSession,
    addCredentialAccount,
    addQrAccount,
    addTokenAccount,
    mappedAccounts,
    mappedActiveAccount,
    refreshAccountSession,
    removeAccount,
    resolveSite,
    isHydrated,
    settings,
    setActiveAccount,
    updateSettings,
  ]);

  return <AppContext value={value}>{children}</AppContext>;
}

export function useAppState() {
  const value = React.use(AppContext);
  if (!value) {
    throw new Error("useAppState must be used within AppProvider");
  }
  return value;
}

function mapAccount(account: ReturnType<typeof useSession>["accounts"][number]): MoodleAccount {
  const authMethod = mapAuthMethod(account.authMethod);
  const timestamp = account.lastUsedAt ?? 0;

  return {
    id: account.id,
    siteUrl: account.siteOrigin,
    origin: account.siteOrigin,
    label: account.fullname ?? account.username ?? account.siteOrigin,
    authMethod,
    username: account.username,
    fullname: account.fullname,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
    avatarUrl: account.avatarUrl,
  };
}

function mapAuthMethod(method: ReturnType<typeof useSession>["accounts"][number]["authMethod"]): MoodleAccount["authMethod"] {
  return method === "qr" ? "qr" : "credentials";
}

function mapSession(session: ReturnType<typeof useSession>["activeSession"]): MoodleSession | null {
  if (!session) {
    return null;
  }

  return {
    token: session.token,
    privateToken: session.privateToken,
    accessKey: session.accessKey,
    userId: session.account.userId,
    username: session.account.username,
    fullname: session.account.fullname,
    authenticatedAt: session.authenticatedAt,
    refreshedAt: session.authenticatedAt,
  };
}

function normalizeSiteUrl(value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  return `https://${trimmed.replace(/\/$/, "")}`;
}
