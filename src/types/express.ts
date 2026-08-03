import type { AuthUser } from "./auth";

declare global {
  namespace Express {
    interface Request {
      /** Set by `protect` after JWT verification. */
      user?: AuthUser;
      /** Correlates the HTTP response with structured server logs. */
      requestId?: string;
    }
  }
}

export type { AuthUser };
