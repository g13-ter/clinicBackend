import { Request, Response, NextFunction } from "express";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";

const userService = new UserService();

// CREATE
export const createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const performedBy = (req as any).user.id;
    const { name, email, password, role } = req.body;
    const user = await userService.createUser({ name, email, password, role });

    // never include password (hashed or not) in the audit log
    const { password: _omit, ...safeUser } = user.toObject();

    logAudit({
      action: "create",
      resource: "User",
      resourceId: String(user._id),
      performedBy,
      after: safeUser,
      method: req.method,
      path: req.originalUrl,
    });

    res.status(201).json({ success: true, message: "User created successfully", data: user });
  } catch (error) {
    next(error);
  }
};

// GET ALL
export const getUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const performedBy = (req as any).user.id;
    const pagination = getPaginationParams(req.query);
    const { users, total } = await userService.getUsers(pagination);

    logAudit({
      action: "view",
      resource: "User",
      resourceId: "list",
      performedBy,
      after: { viewedIds: users.map((u: any) => String(u._id)), page: pagination.page },
      method: req.method,
      path: req.originalUrl,
    });

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

// GET BY ID
export const getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const performedBy = (req as any).user.id;
    const id = req.params.id as string;
    const user = await userService.getUserById(id);

    logAudit({
      action: "view",
      resource: "User",
      resourceId: id,
      performedBy,
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "User retrieved successfully", data: user });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const performedBy = (req as any).user.id;
    const { name, email, password, role } = req.body;

    const { before, after } = await userService.updateUser(id, { name, email, password, role });

    logAudit({
      action: "update",
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

// DELETE
export const deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const performedBy = (req as any).user.id;

    const deletedUser = await userService.deleteUser(id);

    logAudit({
      action: "delete",
      resource: "User",
      resourceId: id,
      performedBy,
      before: deletedUser.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
};