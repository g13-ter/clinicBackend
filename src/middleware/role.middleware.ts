import { Request, Response, NextFunction } from "express";
import { AppError } from "./error.middleware";
import type { UserRole } from "../types/roles";
import { roleHasPermission } from "../config/permissions";

export const allowRoles = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user?.role) {
      next(new AppError("Access denied", 403));
      return;
    }

    if (!roleHasPermission(req.user.role, roles)) {
      next(new AppError("Access denied", 403));
      return;
    }

    next();
  };
};
