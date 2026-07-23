import express from "express";
import { getDashboardStats } from "../controllers/dashboard.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();

// All authenticated roles - each dashboard just displays a different
// subset of these same aggregate counts.
router.get(
  "/stats",
  protect,
  allowRoles("admin", "doctor", "nurse", "staff"),
  getDashboardStats
);

export default router;