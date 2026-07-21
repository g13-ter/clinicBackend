import type { AuthUser } from "./auth";

declare global {
  namespace Express {
    interface Request {
      /** Set by `protect` after JWT verification. */
      user?: AuthUser;
    }
  }
}

export type { AuthUser };