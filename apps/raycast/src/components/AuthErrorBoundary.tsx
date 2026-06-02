import { isAuthError, type MoodleSession } from "@moodle/core";
import { useNavigation } from "@raycast/api";
import { Component, useEffect, useRef, type ReactNode } from "react";

import { resetUserState } from "../client";
import { setCredentialsLoginHandler } from "../credentials-login-request";
import AuthErrorDetail from "./AuthErrorDetail";
import CredentialsLoginForm from "./CredentialsLoginForm";

type AuthErrorBoundaryProps = {
  children: ReactNode;
};

type AuthErrorBoundaryState = {
  error: unknown;
};

class AuthErrorBoundaryInner extends Component<
  AuthErrorBoundaryProps,
  AuthErrorBoundaryState
> {
  state: AuthErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: unknown): AuthErrorBoundaryState {
    return { error };
  }

  render() {
    const { error } = this.state;

    if (error) {
      if (isAuthError(error)) {
        return (
          <AuthErrorDetail
            error={error}
            onRetry={() => {
              resetUserState();
              this.setState({ error: undefined });
            }}
          />
        );
      }

      throw error;
    }

    return this.props.children;
  }
}

export default function AuthErrorBoundary(props: AuthErrorBoundaryProps) {
  useCredentialsLoginNavigation();
  return <AuthErrorBoundaryInner {...props} />;
}

function useCredentialsLoginNavigation() {
  const { pop, push } = useNavigation();
  const pending = useRef<Promise<MoodleSession> | null>(null);

  setCredentialsLoginHandler(() => {
    if (pending.current) return pending.current;

    pending.current = new Promise((resolve, reject) => {
      push(
        <CredentialsLoginForm
          onCancel={() => {
            pending.current = null;
            pop();
            reject(new Error("Credentials login cancelled"));
          }}
          onSuccess={(session) => {
            pending.current = null;
            pop();
            resolve(session);
          }}
        />,
      );
    });

    return pending.current;
  });

  useEffect(() => {
    return () => setCredentialsLoginHandler(null);
  }, []);
}
