import { isAuthError } from "@moodle/core";
import { Component, type ReactNode } from "react";

import { resetUserState } from "../client";
import AuthErrorDetail from "./AuthErrorDetail";

type AuthErrorBoundaryProps = {
  children: ReactNode;
};

type AuthErrorBoundaryState = {
  error: unknown;
};

export default class AuthErrorBoundary extends Component<
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
