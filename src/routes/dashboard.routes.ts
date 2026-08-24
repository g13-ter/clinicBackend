import express from "express";
import { getAnalyticsStats, getDashboardStats, getSuperAdminDashboard } from "../controllers/dashboard.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();

router.get(
  "/superadmin",
  protect,
  allowRoles("superadmin"),
  getSuperAdminDashboard,
);

// Each role displays a subset of the same aggregate data.
router.get(
  "/stats",
  protect,
  allowRoles("admin", "doctor", "nurse", "staff"),
  getDashboardStats
);

// Clinical analytics are never exposed to administrative or front-desk accounts.
router.get(
  "/analytics",
  protect,
  allowRoles("doctor", "nurse"),
  getAnalyticsStats,
);

export default router;
