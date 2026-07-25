import express from "express";

import {
  createUser,
  getUsers,
  getUserById,
  getDoctors,
  updateUser,
  deleteUser,
} from "../controllers/user.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { registerSchema, updateUserSchema } from "../validators/schemas";

const router = express.Router();


// GET DOCTORS (for appointment booking's "select a doctor" step)
// Staff, Nurse, Doctor, Admin - THIS MUST COME BEFORE "/:id" below, or
// Express will match "/doctors" as "/:id" with id="doctors", which then
// fails with a Mongoose CastError trying to look up a user by that
// literal string as an ObjectId.
router.get(
  "/doctors",
  protect,
  allowRoles("staff", "nurse", "doctor", "admin"),
  getDoctors
);


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
  validateBody(registerSchema),
  createUser
);


// UPDATE USER
// Admin only
router.put(
  "/:id",
  protect,
  allowRoles("admin"),
  validateBody(updateUserSchema),
  updateUser
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