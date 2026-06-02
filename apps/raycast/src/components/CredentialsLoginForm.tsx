import { authenticateWithCredentials, type MoodleSession } from "@moodle/core";
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

import { saveStoredCredentials } from "../client";
import { siteOrigin } from "../helpers/preferences";

type CredentialsLoginFormProps = {
  onCancel: () => void;
  onSuccess: (session: MoodleSession) => void;
};

type CredentialsLoginFormValues = {
  username: string;
  password: string;
};

export default function CredentialsLoginForm({
  onCancel,
  onSuccess,
}: CredentialsLoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { handleSubmit, itemProps } = useForm<CredentialsLoginFormValues>({
    async onSubmit(values) {
      await submit(values);
    },
    validation: {
      username: FormValidation.Required,
      password: FormValidation.Required,
    },
  });

  async function submit(values: CredentialsLoginFormValues) {
    const username = values.username.trim();

    setIsLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Signing in to Moodle",
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
      toast.style = Toast.Style.Failure;
      toast.title = "Login failed";
      toast.message = error instanceof Error ? error.message : String(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Login"
            icon={Icon.Person}
            onSubmit={handleSubmit}
          />
          <Action title="Go Back" icon={Icon.ArrowLeft} onAction={onCancel} />
        </ActionPanel>
      }
    >
      <Form.Description
        text={`Sign in with your Moodle account for ${siteOrigin}.`}
      />
      <Form.TextField title="Username" {...itemProps.username} />
      <Form.PasswordField title="Password" {...itemProps.password} />
    </Form>
  );
}
