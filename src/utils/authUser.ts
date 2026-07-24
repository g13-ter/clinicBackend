import type { Request } from "express";
import { AppError } from "../middleware/error.middleware";
import type { AuthUser } from "../types/auth";
import { toObjectId } from "./objectId";

/** Returns the authenticated user or throws 403 — use in handlers behind `protect`. */
export const getAuthenticatedUser = (req: Request): AuthUser => {
  if (!req.user) {
    throw new AppError("Access denied", 403);
  }
  return req.user;
};

/** MongoDB ObjectId for the authenticated user — use when writing ref fields. */
export const getAuthenticatedObjectId = (req: Request) => toObjectId(getAuthenticatedUser(req).id);
