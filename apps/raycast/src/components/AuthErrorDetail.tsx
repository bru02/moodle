import { AuthError, isAuthError } from "@moodle/core";
import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  openExtensionPreferences,
} from "@raycast/api";

import { isQrAuth } from "../helpers/preferences";

type AuthErrorDetailProps = {
  error: unknown;
  onRetry?: () => void;
};

function formatDetails(error: AuthError) {
  const details: string[] = [];
  if (error.code) {
    details.push(`- Code: ${error.code}`);
  }
  if (error.status) {
    details.push(`- HTTP status: ${error.status}`);
  }
  return details.length > 0 ? `\n## Details\n${details.join("\n")}` : "";
}

export default function AuthErrorDetail({
  error,
  onRetry,
}: AuthErrorDetailProps) {
  const isAuth = isAuthError(error);
  const message = error instanceof Error ? error.message : "Unexpected error";
  const title = isAuth ? "Authentication Error" : "Request Failed";

  const troubleshooting = isAuth
    ? isQrAuth
      ? [
          "- Open extension preferences and paste a fresh Moodle Mobile QR login URL.",
          "- Make sure the QR link has not expired.",
          "- Retry after updating preferences.",
        ]
      : [
          "- Open extension preferences and verify `site_url`, `username`, and `password`.",
          "- Re-enter your password if it has changed.",
          "- Retry after updating preferences.",
        ]
    : [
        "- Retry the request.",
        "- Check your network connection and Moodle availability.",
      ];

  const markdown = `# ${title}\n\n${message}\n\n## Try this\n${troubleshooting.join("\n")}${
    isAuth ? formatDetails(error) : ""
  }`;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action
            title="Open Extension Preferences"
            icon={Icon.Gear}
            onAction={openExtensionPreferences}
          />
          <Action
            title="Retry"
            icon={Icon.ArrowClockwise}
            onAction={() => onRetry?.()}
          />
        </ActionPanel>
      }
    />
  );
}
