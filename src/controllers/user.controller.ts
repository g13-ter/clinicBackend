import { Request, Response, NextFunction } from "express";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser } from "../utils/authUser";
import { getRolePermissionMatrix } from "../config/permissions";
import { withMongoTransaction } from "../utils/transaction";

const userService = new UserService();

export const getRolePermissions = (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: "Role permissions retrieved successfully",
    data: getRolePermissionMatrix(),
  });
};

// CREATE
export const createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const actor = getAuthenticatedUser(req);
    const performedBy = actor.id;
    const { name, email, password, role, actorPassword } = req.body;
    const user = await withMongoTransaction(async (session) => {
      const created = await userService.createUser(actor.id, actor.role, actorPassword, { name, email, password, role }, session);
      const { password: _omit, ...safeCreated } = created.toObject();
      await logAudit({
        action: "create",
        resource: "User",
        resourceId: String(created._id),
        performedBy,
        after: safeCreated,
        method: req.method,
        path: req.originalUrl,
        ...(session ? { session } : {}),
        required: true,
      });
      return created;
    });

    // Never expose password data.
    const { password: _omit, ...safeUser } = user.toObject();

    res.status(201).json({ success: true, message: "User created successfully", data: safeUser });
  } catch (error) {
    if (req.user?.id) {
      await logAudit({
        action: "create",
        resource: "User",
        resourceId: "new-account",
        performedBy: req.user.id,
        after: {
          attempted: true,
          successful: false,
          requestedRole: req.body?.role,
          reason: error instanceof Error ? error.message : "Unknown error",
        },
        method: req.method,
        path: req.originalUrl,
      });
    }
    next(error);
  }
};

// GET ALL — read-only, not audit-logged
export const getUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const actor = getAuthenticatedUser(req);
    const pagination = getPaginationParams(req.query);
    const { users, total } = await userService.getUsers(pagination, actor.role);

    res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: users,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};

// GET DOCTORS — booking and schedule lookup, not audit-logged
export const getDoctors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const doctors = await userService.getDoctors();
    res.status(200).json({ success: true, message: "Doctors retrieved successfully", data: doctors });
  } catch (error) {
    next(error);
  }
};

// GET BY ID — read-only, not audit-logged
export const getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const user = await userService.getUserById(id, actor.role);

    res.status(200).json({ success: true, message: "User retrieved successfully", data: user });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const performedBy = actor.id;
    const { name, email, password, role, isActive, actorPassword } = req.body;

    const { before, after } = await withMongoTransaction(async (session) => {
      const result = await userService.updateUser(id, actor.id, actor.role, actorPassword, { name, email, password, role, isActive }, session);
      await logAudit({
        action: result.before.isActive === false && result.after.isActive === true ? "reactivate" : "update",
        resource: "User",
        resourceId: id,
        performedBy,
        before: result.before.toObject(),
        after: result.after.toObject(),
        method: req.method,
        path: req.originalUrl,
        ...(session ? { session } : {}),
        required: true,
      });
      return result;
    });

    res.status(200).json({ success: true, message: "User updated successfully", data: after });
  } catch (error) {
    if (req.user?.id) {
      await logAudit({
        action: "update",
        resource: "User",
        resourceId: req.params.id as string,
        performedBy: req.user.id,
        after: {
          attempted: true,
          successful: false,
          requestedRole: req.body?.role,
          passwordReset: Boolean(req.body?.password),
          reactivation: req.body?.isActive === true,
          reason: error instanceof Error ? error.message : "Unknown error",
        },
        method: req.method,
        path: req.originalUrl,
      });
    }
    next(error);
  }
};

// DEACTIVATE (keeps ownership and audit references intact)
export const deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let performedBy = "";
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    performedBy = actor.id;

    const { before, after } = await withMongoTransaction(async (session) => {
      const result = await userService.deactivateUser(id, performedBy, actor.role, req.body?.actorPassword, session);
      await logAudit({
        action: "deactivate",
        resource: "User",
        resourceId: id,
        performedBy,
        before: result.before.toObject(),
        after: result.after.toObject(),
        method: req.method,
        path: req.originalUrl,
        ...(session ? { session } : {}),
        required: true,
      });
      return result;
    });

    res.status(200).json({
      success: true,
      message: "User deactivated. Their active sessions have been revoked.",
      data: after,
    });
  } catch (error) {
    if (performedBy) {
      await logAudit({
        action: "deactivate",
        resource: "User",
        resourceId: req.params.id as string,
        performedBy,
        after: {
          attempted: true,
          successful: false,
          reason: error instanceof Error ? error.message : "Unknown error",
        },
        method: req.method,
        path: req.originalUrl,
      });
    }
    next(error);
  }
};

export const getCurrentUserProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await userService.getUserById(getAuthenticatedUser(req).id);
    res.status(200).json({ success: true, message: "Profile retrieved successfully", data: user });
  } catch (error) {
    next(error);
  }
};

export const updateCurrentUserProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const actor = getAuthenticatedUser(req);
    const { before, after, sessionRevoked } = await userService.updateOwnProfile(actor.id, req.body);
    await logAudit({
      action: "update",
      resource: "User",
      resourceId: actor.id,
      performedBy: actor.id,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });
    res.status(200).json({
      success: true,
      message: sessionRevoked
        ? "Profile updated. Sign in again with your new password."
        : "Profile updated successfully",
      data: { user: after, sessionRevoked },
    });
  } catch (error) {
    next(error);
  }
};
