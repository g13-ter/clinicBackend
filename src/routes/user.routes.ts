import express from "express";

import {
  createUser,
  getUsers,
  getUserById,
  getDoctors,
  getCurrentUserProfile,
  updateCurrentUserProfile,
  updateUser,
  deleteUser,
} from "../controllers/user.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { registerSchema, updateOwnProfileSchema, updateUserSchema } from "../validators/schemas";

const router = express.Router();


// Keep this static route before "/:id".
router.get(
  "/doctors",
  protect,
  allowRoles("staff", "nurse", "doctor", "admin"),
  getDoctors
);

router.put(
  "/me",
  protect,
  validateBody(updateOwnProfileSchema),
  updateCurrentUserProfile,
);

router.get(
  "/me",
  protect,
  getCurrentUserProfile
);


// GET ALL USERS
// Admin only
router.get(
  "/",
  protect,
  allowRoles("admin", "superadmin"),
  getUsers
);


// GET USER BY ID
// Admin only
router.get(
  "/:id",
  protect,
  allowRoles("admin", "superadmin"),
  getUserById
);


// CREATE USER
// Admin only
router.post(
  "/",
  protect,
  allowRoles("admin", "superadmin"),
  validateBody(registerSchema),
  createUser
);


// UPDATE USER
// Admin only
router.put(
  "/:id",
  protect,
  allowRoles("admin", "superadmin"),
  validateBody(updateUserSchema),
  updateUser
);


// DELETE USER
// Admin only
router.delete(
  "/:id",
  protect,
  allowRoles("admin", "superadmin"),
  deleteUser
);

export default router;
