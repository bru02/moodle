import { Image } from "expo-image";
import React from "react";
import { Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { resolveMoodleImageUrl } from "@/lib/moodle-images";
import { useAppState } from "@/providers/app-provider";

export function AccountAvatar({
  label,
  avatarUrl,
  size = 44,
  siteOrigin,
}: {
  label?: string;
  avatarUrl?: string;
  size?: number;
  siteOrigin?: string;
}) {
  const { activeAccount, activeAccountId, accountSession } = useAppState();
  const session = activeAccountId ? accountSession(activeAccountId) : null;

  const bgColor = platformColors.tertiarySystemFill;
  const textColor = platformColors.secondaryLabel;
  const resolvedAvatarUrl = resolveMoodleImageUrl({
    url: avatarUrl,
    siteOrigin: siteOrigin ?? activeAccount?.origin,
    accessKey: session?.accessKey,
  });
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [resolvedAvatarUrl]);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bgColor,
      }}
    >
      {resolvedAvatarUrl && !imageFailed ? (
        <Image
          source={resolvedAvatarUrl}
          style={{ width: size, height: size }}
          contentFit="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text
          style={{
            width: "100%",
            fontSize: size * 0.38,
            lineHeight: size * 0.42,
            fontWeight: "700",
            color: textColor,
            textAlign: "center",
          }}
        >
          {getInitials(label)}
        </Text>
      )}
    </View>
  );
}

export function AccountIdentity({
  label,
  avatarUrl,
  secondary,
}: {
  label?: string;
  avatarUrl?: string;
  secondary?: string;
}) {
  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <AccountAvatar label={label} avatarUrl={avatarUrl} size={52} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text selectable style={{ fontSize: 17, fontWeight: "600", color: labelColor }}>
          {label || "Moodle account"}
        </Text>
        {secondary ? (
          <Text selectable style={{ fontSize: 13, color: label2Color }}>
            {secondary}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function getInitials(input?: string) {
  const words = (input ?? "Moodle User").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "MU";
}
