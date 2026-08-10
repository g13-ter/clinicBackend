import { Request, Response, NextFunction } from "express";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser } from "../utils/authUser";

const userService = new UserService();

// CREATE
export const createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const actor = getAuthenticatedUser(req);
    const performedBy = actor.id;
    const { name, email, password, role } = req.body;
    const user = await userService.createUser(actor.role, { name, email, password, role });

    // Never expose password data.
    const { password: _omit, ...safeUser } = user.toObject();

    await logAudit({
      action: "create",
      resource: "User",
      resourceId: String(user._id),
      performedBy,
      after: safeUser,
      method: req.method,
      path: req.originalUrl,
    });

    res.status(201).json({ success: true, message: "User created successfully", data: safeUser });
  } catch (error) {
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
    const { name, email, password, role, isActive } = req.body;

    const { before, after } = await userService.updateUser(id, actor.id, actor.role, { name, email, password, role, isActive });

    await logAudit({
      action: before.isActive === false && after.isActive === true ? "reactivate" : "update",
      resource: "User",
      resourceId: id,
      performedBy,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "User updated successfully", data: after });
  } catch (error) {
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

    const { before, after } = await userService.deactivateUser(id, performedBy, actor.role);

    await logAudit({
      action: "deactivate",
      resource: "User",
      resourceId: id,
      performedBy,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
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
