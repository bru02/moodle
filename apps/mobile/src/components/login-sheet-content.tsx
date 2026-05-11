import { CameraView, useCameraPermissions } from "expo-camera";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Image } from "expo-image";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { NativeIconButton } from "@/components/native-icon-button";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { parseIncomingMoodleLink, prepareBrowserSSOLogin } from "@/lib/deep-links";
import { openExternalUrl } from "@/lib/browser";
import { useSession } from "@/providers/session-provider";

interface ResolvedSite {
  siteUrl: string;
  siteName: string;
  launchUrl: string;
}

export function LoginSheetContent() {
  const [siteUrl, setSiteUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const session = useSession();

  const [resolvedSite, setResolvedSite] = useState<ResolvedSite | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmedSiteUrl = siteUrl.trim();

  const handleUrlFocus = () => {
    if (!siteUrl) {
      setSiteUrl("https://");
    }
  };

  const handleQrScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError("Camera access is required to scan QR codes.");
        return;
      }
    }

    setError(null);

    let handled = false;
    const subscription = CameraView.onModernBarcodeScanned(({ data }) => {
      if (handled) {
        return;
      }
      handled = true;
      subscription.remove();
      void CameraView.dismissScanner();

      void (async () => {
        const parsed = parseIncomingMoodleLink(data);
        if (!parsed) {
          setError("This QR code isn't a recognized Moodle link.");
          return;
        }

        if (parsed.kind === "qr") {
          try {
            setBusy(true);
            setError(null);
            setSiteUrl(parsed.siteUrl);
            await session.signInWithQrPayload(
              `${parsed.siteUrl}?qrlogin=${encodeURIComponent(parsed.qrLoginKey)}&userid=${encodeURIComponent(parsed.userId)}`,
            );
            router.replace("/courses" as Href);
          } catch (e) {
            setBusy(false);
            setError(e instanceof Error ? e.message : "Could not sign in with this QR code.");
          }
          return;
        }

        if (parsed.kind === "site") {
          setSiteUrl(parsed.siteUrl);
          setError(null);
        }
      })();
    });

    try {
      await CameraView.launchScanner({ barcodeTypes: ["qr"] });
      if (!handled) {
        subscription.remove();
      }
    } catch {
      subscription.remove();
      setError("Could not open scanner. Please try again.");
    }
  };

  const handleContinue = async () => {
    if (!trimmedSiteUrl) {
      setError("Please enter a site URL");
      return;
    }

    if (isContinuing) {
      return;
    }

    setIsContinuing(true);
    setError(null);

    try {
      const resolved = await session.resolveSite({ siteUrl: trimmedSiteUrl });
      if (!resolved.showLoginForm) {
        const loginUrl = await prepareBrowserSSOLogin({
          siteUrl: resolved.siteUrl,
          launchUrl: resolved.launchUrl,
        });
        await openExternalUrl(loginUrl);
        return;
      }

      setResolvedSite({
        siteUrl: resolved.siteUrl,
        siteName: resolved.siteName ?? "",
        launchUrl: resolved.launchUrl ?? "",
      });
    } catch (continueError) {
      setError(continueError instanceof Error ? continueError.message : "Could not connect to this Moodle site.");
    } finally {
      setIsContinuing(false);
    }
  };

  const handleSignIn = async () => {
    if (!resolvedSite) {
      return;
    }

    const usernameValue = username.trim();
    const passwordValue = password.trim();

    setBusy(true);
    setError(null);

    try {
      await session.signInWithCredentials({
        siteOrigin: resolvedSite.siteUrl,
        username: usernameValue,
        password: passwordValue,
      });
      router.replace("/courses" as Href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleBack = () => {
    setResolvedSite(null);
    setUsername("");
    setPassword("");
    setError(null);
  };

  if (resolvedSite) {
    const usernameValue = username.trim();
    const passwordValue = password.trim();

    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 34, gap: 20 }}
        style={{ flex: 1 }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={handleBack}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            alignSelf: "flex-start",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Image source="sf:chevron.left" style={{ width: 14, height: 14, tintColor: platformColors.systemBlue }} contentFit="contain" />
          <Text style={{ fontSize: 17, color: platformColors.systemBlue }}>Back</Text>
        </Pressable>

        <View style={{ gap: 6 }}>
          <Text
            selectable
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: platformColors.label,
            }}
          >
            {resolvedSite.siteName ? `Sign in to ${resolvedSite.siteName}` : "Sign in with username and password"}
          </Text>
          <Text
            selectable
            style={{ fontSize: 15, color: platformColors.secondaryLabel }}
          >
            {`Using ${resolvedSite.siteUrl}.`}
          </Text>
        </View>

        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          returnKeyType="next"
          textContentType="username"
        />
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="go"
          textContentType="password"
          onSubmitEditing={() => {
            void handleSignIn();
          }}
        />

        {error ? (
          <Text
            selectable
            style={{
              fontSize: 13,
              fontWeight: "500",
              color: platformColors.systemRed,
            }}
          >
            {error}
          </Text>
        ) : null}

        <PrimaryButton
          label={busy ? "Signing in…" : "Sign in"}
          disabled={busy || !usernameValue || !passwordValue}
          onPress={() => {
            void handleSignIn();
          }}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 34, gap: 20 }}
      style={{ flex: 1 }}
    >
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            color: platformColors.label,
          }}
        >
          Connect your campus site
        </Text>
        <Text style={{ fontSize: 15, color: platformColors.secondaryLabel }}>
          Paste your Moodle URL or scan a QR code to continue.
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10, alignItems: "stretch" }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 14,
            minHeight: 50,
            borderRadius: 12,
            borderCurve: "continuous",
            backgroundColor: platformColors.tertiarySystemFill,
          }}
        >
          <Image source="sf:globe" style={{ width: 18, height: 18, tintColor: platformColors.secondaryLabel }} contentFit="contain" />
          <TextInput
            value={siteUrl}
            placeholder="https://moodle.example.edu"
            placeholderTextColor={platformColors.placeholderText as string}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={handleUrlFocus}
            onChangeText={(text) => {
              setSiteUrl(text);
              setError(null);
            }}
            returnKeyType="go"
            onSubmitEditing={() => {
              void handleContinue();
            }}
            style={{
              flex: 1,
              fontSize: 17,
              color: platformColors.label as string,
            }}
          />
        </View>

        <NativeIconButton
          label="Scan QR code"
          systemImage="qrcode.viewfinder"
          onPress={handleQrScan}
          tintColor={platformColors.systemBlue}
          style={{
            width: 50,
            height: 50,
            alignItems: "center",
            justifyContent: "center",
          }}
        />
      </View>

      {error ? (
        <Text
          selectable
          style={{
            fontSize: 13,
            fontWeight: "500",
            color: platformColors.systemRed,
          }}
        >
          {error}
        </Text>
      ) : null}

      <PrimaryButton
        label={isContinuing ? "Checking site…" : "Continue"}
        disabled={!trimmedSiteUrl || isContinuing}
        onPress={() => {
          void handleContinue();
        }}
      />
    </ScrollView>
  );
}
