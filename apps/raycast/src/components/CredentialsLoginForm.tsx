import {
  authenticateWithCredentials,
  type MoodleIdentityProvider,
  type MoodleSession,
} from "@moodle/core";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  Toast,
  showToast,
} from "@raycast/api";
import { FormValidation, useForm } from "@raycast/utils";
import { useState } from "react";

import { saveSession, saveStoredCredentials } from "../client";
import { siteOrigin } from "../helpers/preferences";
import { authenticateWithMoodleIdentityProvider } from "../oauth-auth";

type CredentialsLoginFormProps = {
  identityProviders?: MoodleIdentityProvider[];
  siteName?: string;
  onSuccess: (session: MoodleSession) => void;
};

type CredentialsLoginFormValues = {
  username: string;
  password: string;
};

export default function CredentialsLoginForm({
  identityProviders = [],
  siteName,
  onSuccess,
}: CredentialsLoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const loginTarget = siteName?.trim() || 'Moodle';

  const { handleSubmit, itemProps } = useForm<CredentialsLoginFormValues>({
    async onSubmit(values) {
      const username = values.username.trim();

      setIsLoading(true);
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Signing in to ${loginTarget}`,
      });

      try {
        const session = await authenticateWithCredentials({
          siteOrigin,
          username,
          password: values.password,
        });
        await saveStoredCredentials(
          { username, password: values.password },
          session,
        );
        toast.style = Toast.Style.Success;
        toast.title = "Logged in";
        onSuccess(session);
      } catch (error) {
        const message = getErrorMessage(error);
        toast.style = Toast.Style.Failure;
        toast.title = `Login failed: ${message}`;
        toast.message = message;
      } finally {
        setIsLoading(false);
      }
    },
    validation: {
      username: FormValidation.Required,
      password: FormValidation.Required,
    },
  });

  async function loginWithIdentityProvider(provider: MoodleIdentityProvider) {
    setIsLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Opening ${provider.name}`,
    });

    try {
      const result = await authenticateWithMoodleIdentityProvider(
        siteOrigin,
        provider,
      );
      saveSession(result.session);
      toast.style = Toast.Style.Success;
      toast.title = "Logged in";
      onSuccess(result.session);
    } catch (error) {
      const message = getErrorMessage(error);
      toast.style = Toast.Style.Failure;
      toast.title = `Login failed: ${message}`;
      toast.message = message;
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={`Login to ${loginTarget}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Login"
            icon={Icon.Person}
            onSubmit={handleSubmit}
          />
          {identityProviders.length > 0 ? (
            <ActionPanel.Section title="Login via...">
              {identityProviders.map((provider) => (
                <Action
                  key={provider.url}
                  title={provider.name}
                  icon={
                    provider.iconurl ? { source: provider.iconurl } : Icon.Globe
                  }
                  onAction={() => {
                    void loginWithIdentityProvider(provider);
                  }}
                />
              ))}
            </ActionPanel.Section>
          ) : null}
        </ActionPanel>
      }
    >
      <Form.TextField title="Username" {...itemProps.username} />
      <Form.PasswordField title="Password" {...itemProps.password} />
    </Form>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
