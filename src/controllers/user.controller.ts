import { Request, Response, NextFunction } from "express";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser } from "../utils/authUser";

const userService = new UserService();

// CREATE
export const createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const performedBy = getAuthenticatedUser(req).id;
    const { name, email, password, role } = req.body;
    const user = await userService.createUser({ name, email, password, role });

    // never include password (hashed or not) in the audit log or the API response
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

    res.status(201).json({ success: true, message: "User created successfully", data: safeUser });
  } catch (error) {
    next(error);
  }
};

// GET ALL — read-only, not audit-logged
export const getUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pagination = getPaginationParams(req.query);
    const { users, total } = await userService.getUsers(pagination);

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

// GET DOCTORS — read-only, not audit-logged. Used to populate the "select
// a doctor" step on appointment booking, and admin's doctor-schedule view.
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
    const user = await userService.getUserById(id);

    res.status(200).json({ success: true, message: "User retrieved successfully", data: user });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const performedBy = getAuthenticatedUser(req).id;
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
    const performedBy = getAuthenticatedUser(req).id;

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