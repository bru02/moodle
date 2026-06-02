import { AuthError, isAuthError } from "@moodle/core";
import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  openExtensionPreferences,
} from "@raycast/api";

import { clearStoredCredentials } from "../client";

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
  if (error.details) {
    details.push(`- Exception: ${error.details}`);
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
    ? [
        "- Open extension preferences and verify `site_url`.",
        "- Retry the browser sign-in flow or contact your Moodle site support.",
        "- If you previously signed in with a password, clear saved credentials and retry.",
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
            title="Clear Saved Credentials"
            icon={Icon.Trash}
            onAction={() => {
              void clearStoredCredentials();
              onRetry?.();
            }}
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
