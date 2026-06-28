import express from "express";
import { getClinicSummaryReport } from "../controllers/report.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();

// Admin only - this report is meant for the school board/administration,
// not for general staff use.
router.get(
  "/clinic-summary",
  protect,
  allowRoles("admin"),
  getClinicSummaryReport
);

export default router;