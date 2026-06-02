import {
  isAuthError,
  type MoodleIdentityProvider,
  type MoodleSession,
} from "@moodle/core";
import { Detail } from "@raycast/api";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";

import { resetUserState } from "../client";
import {
  setCredentialsLoginHandler,
  type CredentialsLoginOptions,
} from "../credentials-login-request";
import AuthErrorDetail from "./AuthErrorDetail";
import CredentialsLoginForm from "./CredentialsLoginForm";

type AuthErrorBoundaryProps = {
  children: ReactNode;
};

type AuthErrorBoundaryState = {
  error: unknown;
};

type PendingCredentialsLogin = {
  promise: Promise<MoodleSession>;
  resolve: (session: MoodleSession) => void;
  reject: (error: Error) => void;
  identityProviders: MoodleIdentityProvider[];
  siteName?: string;
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
  const credentialsLogin = useCredentialsLoginNavigation();
  if (!credentialsLogin.isReady) return <Detail isLoading />;
  if (credentialsLogin.loginForm) return credentialsLogin.loginForm;

  return <AuthErrorBoundaryInner {...props} />;
}

function useCredentialsLoginNavigation() {
  const pending = useRef<PendingCredentialsLogin | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoginFormVisible, setIsLoginFormVisible] = useState(false);

  useEffect(() => {
    setCredentialsLoginHandler((options?: CredentialsLoginOptions) => {
      if (pending.current) {
        return pending.current.promise;
      }

      let resolveLogin!: (session: MoodleSession) => void;
      let rejectLogin!: (error: Error) => void;
      const promise = new Promise<MoodleSession>((resolve, reject) => {
        resolveLogin = resolve;
        rejectLogin = reject;
      });
      pending.current = {
        promise,
        resolve: resolveLogin,
        reject: rejectLogin,
        identityProviders: options?.identityProviders ?? [],
        siteName: options?.siteName,
      };
      setIsLoginFormVisible(true);

      return promise;
    });

    return () => {
      setCredentialsLoginHandler(null);
    };
  }, []);

  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) return { isReady: false, loginForm: null };

  return {
    isReady: true,
    loginForm: isLoginFormVisible ? (
      <CredentialsLoginForm
        identityProviders={pending.current?.identityProviders ?? []}
        siteName={pending.current?.siteName}
        onSuccess={(session) => {
          const current = pending.current;
          pending.current = null;
          setIsLoginFormVisible(false);
          current?.resolve(session);
        }}
      />
    ) : null,
  };
}
