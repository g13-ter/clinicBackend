import type { AuthUser } from "./auth";

declare global {
  namespace Express {
    interface Request {
      /** Set by `protect` after JWT verification. */
      user?: AuthUser;
      /** Current database-backed Terms and Agreement acceptance state. */
      termsAccepted?: boolean;
      /** Correlates the HTTP response with structured server logs. */
      requestId?: string;
    }
  }
}

export type { AuthUser };
