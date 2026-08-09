import express from "express";
import {
  exportReportCsv,
  getAnnualMedicationReport,
  getClinicSummaryReport,
} from "../controllers/report.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();

// Reports contain clinical and inventory analytics and are restricted to clinical roles.
router.get(
  "/annual-medication",
  protect,
  allowRoles("doctor", "nurse"),
  getAnnualMedicationReport,
);

router.get(
  "/clinic-summary",
  protect,
  allowRoles("doctor", "nurse"),
  getClinicSummaryReport
);

router.get(
  "/export/:type",
  protect,
  allowRoles("doctor", "nurse"),
  exportReportCsv,
);

export default router;
