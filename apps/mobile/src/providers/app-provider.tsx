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

  const value = React.useMemo<AppContextValue>(() => {
    const mappedAccounts = session.accounts.map(mapAccount);
    const mappedActiveAccount = session.activeAccount ? mapAccount(session.activeAccount) : null;

    return {
      ready: session.isHydrated,
      accounts: mappedAccounts,
      activeAccountId: mappedActiveAccount?.id ?? null,
      activeAccount: mappedActiveAccount,
      settings: session.settings,
      async setActiveAccount(id) {
        if (!id) {
          return;
        }
        await session.switchAccount(id);
      },
      async removeAccount(id) {
        await session.removeAccount(id);
      },
      async resolveSite(input) {
        return await session.resolveSite(input);
      },
      async addCredentialAccount(input) {
        await session.signInWithCredentials({
          siteOrigin: input.siteUrl,
          username: input.username,
          password: input.password,
        });
      },
      async addTokenAccount(input) {
        await session.signInWithToken({
          siteOrigin: input.siteUrl,
          token: input.token,
          privateToken: input.privateToken,
        });
      },
      async addQrAccount(input) {
        const payload = `${normalizeSiteUrl(input.siteUrl)}?qrlogin=${encodeURIComponent(input.qrLoginKey)}&userid=${encodeURIComponent(input.userId)}`;
        await session.signInWithQrPayload(payload);
      },
      async refreshAccountSession(id) {
        const refreshed = await session.refreshSessionForAccount(id);
        return mapSession(refreshed);
      },
      async updateSettings(next) {
        if (typeof next.mergeSimilarCourses === "boolean") {
          await session.setMergeSimilarCourses(next.mergeSimilarCourses);
        }
      },
      accountSession(id) {
        if (mappedActiveAccount?.id !== id || !session.activeSession) {
          return null;
        }
        return mapSession(session.activeSession);
      },
    };
  }, [session]);

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

  return {
    id: account.id,
    siteUrl: account.siteOrigin,
    origin: account.siteOrigin,
    label: account.fullname ?? account.username ?? account.siteOrigin,
    authMethod,
    username: account.username,
    fullname: account.fullname,
    createdAt: account.lastUsedAt ?? Date.now(),
    updatedAt: account.lastUsedAt ?? Date.now(),
    lastUsedAt: account.lastUsedAt ?? Date.now(),
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
