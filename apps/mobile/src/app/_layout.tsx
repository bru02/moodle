import { buildAuthenticatedExternalOpenUrl, type StoredAccount as CoreStoredAccount } from "@moodle/core";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { router, Stack } from "expo-router";
import { useEffect, useRef } from "react";
import { Linking, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Colors, Spacing } from "@/constants/theme";
import { platformColors } from "@/constants/platform-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { buildAuthenticatedDestinationUrl, parseIncomingMoodleLink, resolveInAppRoute, resolvePendingSSOToken } from "@/lib/deep-links";
import { openExternalUrl } from "@/lib/browser";
import { AppProvider, useAppState } from "@/providers/app-provider";
import { useSession } from "@/providers/session-provider";
import { MoodleQueryProvider } from "@/providers/query-provider";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { ready, activeAccount } = useAppState();
  const session = useSession();
  const recentUrlsRef = useRef<Map<string, number>>(new Map());
  const handlingUrlRef = useRef(false);

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const handleUrl = async (incomingUrl: string) => {
      if (!incomingUrl || handlingUrlRef.current) {
        return;
      }

      const now = Date.now();
      const previousHandledAt = recentUrlsRef.current.get(incomingUrl);
      if (previousHandledAt && now - previousHandledAt < 3000) {
        return;
      }
      recentUrlsRef.current.set(incomingUrl, now);
      handlingUrlRef.current = true;

      try {
        const inAppRoute = resolveInAppRoute(incomingUrl);
        if (inAppRoute) {
          router.replace(inAppRoute as any);
          return;
        }

        const parsed = parseIncomingMoodleLink(incomingUrl);
        if (!parsed) {
          return;
        }

        if (parsed.kind === "qr") {
          await session.signInWithQrPayload(
            `${parsed.siteUrl}?qrlogin=${encodeURIComponent(parsed.qrLoginKey)}&userid=${encodeURIComponent(parsed.userId)}`,
          );
          router.replace("/courses");
          return;
        }

        if (parsed.kind === "sso-token") {
          const resolved = await resolvePendingSSOToken(parsed.encodedPayload);
          const created = await session.signInWithToken({
            siteOrigin: resolved.siteUrl,
            token: resolved.token,
            privateToken: resolved.privateToken,
          });
          router.replace("/courses");

          if (resolved.redirectUrl) {
            await openRedirectInBrowser({
              siteUrl: resolved.siteUrl,
              redirectUrl: resolved.redirectUrl,
              session: created,
            });
          }
          return;
        }

        if (parsed.token) {
          const created = await session.signInWithToken({
            siteOrigin: parsed.siteUrl,
            token: parsed.token,
            privateToken: parsed.privateToken,
          });
          router.replace("/courses");

          if (parsed.redirectUrl) {
            await openRedirectInBrowser({
              siteUrl: parsed.siteUrl,
              redirectUrl: parsed.redirectUrl,
              session: created,
            });
          }
          return;
        }

        const matchingAccount = findMatchingAccount(session.accounts, parsed.siteUrl, parsed.username);
        if (!matchingAccount) {
          router.replace({
            pathname: "/login-sheet",
            params: {
              siteUrl: parsed.siteUrl,
            },
          });
          return;
        }

        if (session.activeAccount?.id !== matchingAccount.id) {
          await session.switchAccount(matchingAccount.id);
        }

        router.replace("/courses");

        if (parsed.redirectUrl) {
          const refreshed = await session.refreshSessionForAccount(matchingAccount.id);
          await openRedirectInBrowser({
            siteUrl: matchingAccount.siteOrigin,
            redirectUrl: parsed.redirectUrl,
            session: refreshed,
          });
        }
      } finally {
        handlingUrlRef.current = false;
      }
    };

    void Linking.getInitialURL().then((url) => {
      if (url) {
        return handleUrl(url);
      }
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [ready, session]);

  if (!ready) {
    return <BootScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: platformColors.systemGroupedBackground } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Protected guard={Boolean(activeAccount)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <MoodleQueryProvider>
          <AppProvider>
            <RootNavigator />
          </AppProvider>
        </MoodleQueryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function BootScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: Spacing.five }} />
  );
}

function findMatchingAccount(
  accounts: readonly CoreStoredAccount[],
  siteUrl: string,
  username?: string,
) {
  const normalizedSite = normalizeSiteOrigin(siteUrl);
  return (
    accounts.find((account) => {
      if (normalizeSiteOrigin(account.siteOrigin) !== normalizedSite) {
        return false;
      }
      if (!username) {
        return true;
      }
      return account.username?.toLowerCase() === username.toLowerCase();
    }) ?? null
  );
}

async function openRedirectInBrowser(input: {
  siteUrl: string;
  redirectUrl: string;
  session: {
    token: string;
    privateToken?: string;
    accessKey: string;
    authenticatedAt: number;
    account: {
      userId: number;
    };
  };
}) {
  const destinationUrl = buildAuthenticatedDestinationUrl({
    siteUrl: input.siteUrl,
    redirectUrl: input.redirectUrl,
  });
  const autologinUrl = await buildAuthenticatedExternalOpenUrl({
    url: destinationUrl,
    siteOrigin: normalizeSiteOrigin(input.siteUrl),
    accessKey: input.session.accessKey,
    token: input.session.token,
    privateToken: input.session.privateToken,
    userId: input.session.account.userId,
    lastAutoLoginAt: input.session.authenticatedAt,
  });
  await openExternalUrl(autologinUrl);
}

function normalizeSiteOrigin(value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  return `https://${trimmed.replace(/\/$/, "")}`;
}
