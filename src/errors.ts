export type AuthErrorOptions = {
  code?: string;
  status?: number;
  details?: string;
};

export class AuthError extends Error {
  code?: string;
  status?: number;
  details?: string;

  constructor(message: string, options: AuthErrorOptions = {}) {
    super(message);
    this.name = "AuthError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
