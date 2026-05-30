import {
  Button,
  Form,
  Host,
  Section,
  SecureField,
  Text as SwiftText,
  TextField,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  autocorrectionDisabled,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  keyboardType,
  listStyle,
  onSubmit,
  submitLabel,
  textContentType,
  textFieldStyle,
  textInputAutocapitalization,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from "expo-camera";
import { router, type Href } from "expo-router";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";
import { openExternalUrl } from "@/lib/browser";
import {
  parseIncomingMoodleLink,
  prepareBrowserSSOLogin,
} from "@/lib/deep-links";
import { useSession } from "@/providers/session-provider";

interface ResolvedSite {
  siteUrl: string;
  siteName: string;
  launchUrl: string;
}

export function LoginSheetContent() {
  const [siteUrl, setSiteUrl] = useState("");
  const siteUrlText = useNativeState("");
  const [error, setError] = useState<string | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const session = useSession();
  const [isScanning, setIsScanning] = useState(false);
  const [hasScannedCode, setHasScannedCode] = useState(false);
  const hasScannedCodeRef = useRef(false);

  const [resolvedSite, setResolvedSite] = useState<ResolvedSite | null>(null);
  const [username, setUsername] = useState("");
  const usernameText = useNativeState("");
  const [password, setPassword] = useState("");
  const passwordText = useNativeState("");
  const [busy, setBusy] = useState(false);

  const trimmedSiteUrl = siteUrl.trim();

  const handleUrlFocus = () => {
    if (!siteUrl) {
      setSiteUrl("https://");
      siteUrlText.value = "https://";
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
    hasScannedCodeRef.current = false;
    setHasScannedCode(false);
    setIsScanning(true);
  };

  const handleScannedQrCode = async ({ data }: BarcodeScanningResult) => {
    if (hasScannedCodeRef.current) {
      return;
    }

    hasScannedCodeRef.current = true;
    setHasScannedCode(true);

    const parsed = parseIncomingMoodleLink(data);
    if (!parsed) {
      setError("This QR code isn't a recognized Moodle link.");
      hasScannedCodeRef.current = false;
      setHasScannedCode(false);
      return;
    }

    if (parsed.kind === "qr") {
      try {
        setBusy(true);
        setError(null);
        setSiteUrl(parsed.siteUrl);
        siteUrlText.value = parsed.siteUrl;
        await session.signInWithQrPayload(
          `${parsed.siteUrl}?qrlogin=${encodeURIComponent(parsed.qrLoginKey)}&userid=${encodeURIComponent(parsed.userId)}`,
        );
        router.replace("/courses" as Href);
      } catch (e) {
        setBusy(false);
        hasScannedCodeRef.current = false;
        setHasScannedCode(false);
        setError(
          e instanceof Error
            ? e.message
            : "Could not sign in with this QR code.",
        );
      }
      return;
    }

    if (parsed.kind === "site") {
      setSiteUrl(parsed.siteUrl);
      siteUrlText.value = parsed.siteUrl;
      setError(null);
      setIsScanning(false);
      hasScannedCodeRef.current = false;
      setHasScannedCode(false);
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
      setError(
        continueError instanceof Error
          ? continueError.message
          : "Could not connect to this Moodle site.",
      );
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
    usernameText.value = "";
    setPassword("");
    passwordText.value = "";
    setError(null);
  };

  if (isScanning) {
    return (
      <View
        style={{ flex: 1, backgroundColor: platformColors.systemBackground }}
      >
        <CameraView
          facing="back"
          onBarcodeScanned={hasScannedCode ? undefined : handleScannedQrCode}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 34,
            }}
          >
            <Host matchContents style={{ alignSelf: "flex-start" }}>
              <Button
                label="Cancel"
                systemImage="xmark"
                onPress={() => {
                  setIsScanning(false);
                  hasScannedCodeRef.current = false;
                  setHasScannedCode(false);
                  setError(null);
                }}
                modifiers={[buttonStyle("bordered"), controlSize("large")]}
              />
            </Host>

            <View
              pointerEvents="none"
              style={{
                alignSelf: "center",
                width: "72%",
                aspectRatio: 1,
                borderRadius: 24,
                borderCurve: "continuous",
                borderWidth: 3,
                borderColor: "rgba(255,255,255,0.92)",
              }}
            />

            <Text
              selectable
              style={{
                color: "white",
                fontSize: 17,
                lineHeight: 22,
                fontWeight: "600",
                textAlign: "center",
                textShadowColor: "rgba(0,0,0,0.45)",
                textShadowRadius: 8,
              }}
            >
              {busy
                ? "Signing in..."
                : "Place the Moodle QR code inside the frame"}
            </Text>
          </View>
        </CameraView>
      </View>
    );
  }

  if (resolvedSite) {
    const usernameValue = username.trim();
    const passwordValue = password.trim();

    return (
      <Host style={{ flex: 1 }}>
        <Form modifiers={[listStyle("insetGrouped")]}>
          <Section
            header={
              <SwiftText>
                {resolvedSite.siteName
                  ? `Sign in to ${resolvedSite.siteName}`
                  : "Sign in"}
              </SwiftText>
            }
            footer={<SwiftText>{`Using ${resolvedSite.siteUrl}.`}</SwiftText>}
          >
            <TextField
              placeholder="Username"
              text={usernameText}
              onTextChange={setUsername}
              modifiers={[
                textContentType("username"),
                textInputAutocapitalization("never"),
                autocorrectionDisabled(),
                submitLabel("next"),
                textFieldStyle("automatic"),
              ]}
            />
            <SecureField
              placeholder="Password"
              text={passwordText}
              onTextChange={setPassword}
              modifiers={[
                textContentType("password"),
                autocorrectionDisabled(),
                submitLabel("go"),
                onSubmit(() => {
                  void handleSignIn();
                }),
                textFieldStyle("automatic"),
              ]}
            />
          </Section>

          {error ? (
            <Section>
              <SwiftText modifiers={[tint(platformColors.systemRed)]}>
                {error}
              </SwiftText>
            </Section>
          ) : null}

          <Section>
            <Button
              label={busy ? "Signing in..." : "Sign in"}
              onPress={() => {
                void handleSignIn();
              }}
              modifiers={[
                buttonStyle("borderedProminent"),
                controlSize("large"),
                tint(platformColors.systemBlue),
                disabledModifier(busy || !usernameValue || !passwordValue),
              ]}
            />
            <Button
              label="Back"
              systemImage="chevron.left"
              onPress={handleBack}
              modifiers={[
                buttonStyle("borderless"),
                controlSize("large"),
                tint(platformColors.systemBlue),
              ]}
            />
          </Section>
        </Form>
      </Host>
    );
  }

  return (
    <Host style={{ flex: 1 }}>
      <Form modifiers={[listStyle("insetGrouped")]}>
        <Section
          header={<SwiftText>Connect your campus site</SwiftText>}
          footer={
            <SwiftText>
              Paste your Moodle URL or scan a QR code to continue.
            </SwiftText>
          }
        >
          <TextField
            placeholder="https://moodle.example.edu"
            text={siteUrlText}
            onFocusChange={(focused) => {
              if (focused) {
                handleUrlFocus();
              }
            }}
            onTextChange={(text) => {
              setSiteUrl(text);
              setError(null);
            }}
            modifiers={[
              keyboardType("url"),
              textContentType("URL"),
              textInputAutocapitalization("never"),
              autocorrectionDisabled(),
              submitLabel("go"),
              onSubmit(() => {
                void handleContinue();
              }),
              textFieldStyle("automatic"),
            ]}
          />
          <Button
            label="Scan QR Code"
            systemImage="qrcode.viewfinder"
            onPress={() => {
              void handleQrScan();
            }}
            modifiers={[
              buttonStyle("borderless"),
              controlSize("large"),
              tint(platformColors.systemBlue),
              disabledModifier(busy),
            ]}
          />
        </Section>

        {error ? (
          <Section>
            <SwiftText modifiers={[tint(platformColors.systemRed)]}>
              {error}
            </SwiftText>
          </Section>
        ) : null}

        <Section>
          <Button
            label={isContinuing ? "Checking site..." : "Continue"}
            onPress={() => {
              void handleContinue();
            }}
            modifiers={[
              buttonStyle("borderedProminent"),
              controlSize("large"),
              tint(platformColors.systemBlue),
              disabledModifier(!trimmedSiteUrl || isContinuing),
            ]}
          />
        </Section>
      </Form>
    </Host>
  );
}
