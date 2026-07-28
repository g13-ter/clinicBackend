import express from "express";
import { exportReportCsv, getClinicSummaryReport } from "../controllers/report.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();

// Nurse prepares the clinic report; admin may also generate it for review.
router.get(
  "/clinic-summary",
  protect,
  allowRoles("admin", "nurse"),
  getClinicSummaryReport
);

router.get(
  "/export/:type",
  protect,
  allowRoles("admin", "nurse"),
  exportReportCsv,
);

export default router;
