import { Request, Response, NextFunction } from "express";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";

const userService = new UserService();

// CREATE
export const createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password, role } = req.body;
    const user = await userService.createUser({ name, email, password, role });
    res.status(201).json({ success: true, message: "User created successfully", data: user });
  } catch (error) {
    next(error);
  }
};

// GET ALL
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

// GET BY ID
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
    const { name, email, password, role } = req.body;
    const user = await userService.updateUser(id, { name, email, password, role });
    res.status(200).json({ success: true, message: "User updated successfully", data: user });
  } catch (error) {
    next(error);
  }
};

// DELETE
export const deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    await userService.deleteUser(id);
    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
};