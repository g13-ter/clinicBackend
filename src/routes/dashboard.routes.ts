import express from "express";
import { getDashboardStats } from "../controllers/dashboard.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();

// Each role displays a subset of the same aggregate data.
router.get(
  "/stats",
  protect,
  allowRoles("admin", "doctor", "nurse", "staff"),
  getDashboardStats
);

export default router;
