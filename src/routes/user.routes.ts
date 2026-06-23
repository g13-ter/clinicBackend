import express from "express";

import {
  createUser,
  getUsers,
  getUserById,
  deleteUser,
} from "../controllers/user.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();


// GET ALL USERS
// Admin only
router.get(
  "/",
  protect,
  allowRoles("admin"),
  getUsers
);


// GET USER BY ID
// Admin only
router.get(
  "/:id",
  protect,
  allowRoles("admin"),
  getUserById
);


// CREATE USER
// Admin only
router.post(
  "/",
  protect,
  allowRoles("admin"),
  createUser
);


// DELETE USER
// Admin only
router.delete(
  "/:id",
  protect,
  allowRoles("admin"),
  deleteUser
);

export default router;