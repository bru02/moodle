import { Button, Host } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, tint } from "@expo/ui/swift-ui/modifiers";
import { Text } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { MoodleHtml } from "@/components/moodle-html";
import { openExternalUrl } from "@/lib/browser";
import { buildAutologinRedirectUrl } from "@/lib/moodle-client";
import { useAppState } from "@/providers/app-provider";

import { getFactRow, ModuleDetailCard, summarizeHost, summarizePath } from "../shared";
import type { ModuleDetailProps } from "../types";

export function UrlDetail({ module }: Pick<ModuleDetailProps, "module">) {
  const { activeAccount, accountSession } = useAppState();
  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;
  const blueColor = platformColors.systemBlue;
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const destinationUrl = module.module.contents?.[0]?.fileurl ?? module.module.url;

  const rows = [
    getFactRow("Destination", summarizeHost(destinationUrl)),
    getFactRow("Type", "External link"),
    getFactRow("Opens", summarizePath(destinationUrl)),
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <ModuleDetailCard
      title="Link"
      rows={rows}
      description={
        module.module.description ? (
          <MoodleHtml html={module.module.description} baseUrl={module.module.url} contents={module.module.contents} variant="secondary" />
        ) : undefined
      }
      emptyCopy="Link details are only available in Moodle."
    >
      {destinationUrl && session && activeAccount ? (
        <Host style={{ width: "100%" }}>
          <Button
            label="Open link"
            onPress={async () => {
              const url = await buildAutologinRedirectUrl({
                siteOrigin: activeAccount.origin,
                session,
                destinationUrl,
              });
              await openExternalUrl(url);
            }}
            modifiers={[buttonStyle("bordered"), controlSize("large"), tint(blueColor)]}
          />
        </Host>
      ) : (
        <Text selectable style={{ fontSize: 14, lineHeight: 21, color: label2Color }}>
          The destination link is not available in-app right now.
        </Text>
      )}
      <Text selectable style={{ fontSize: 14, lineHeight: 21, color: labelColor }}>
        Open in Moodle if the target site requires sign-in or redirects through Moodle first.
      </Text>
    </ModuleDetailCard>
  );
}
