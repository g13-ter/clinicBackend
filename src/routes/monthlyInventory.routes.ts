import express from "express";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { monthlyInventoryDraftSchema, monthlyInventoryPeriodSchema } from "../validators/schemas";
import {
  exportMonthlyInventoryReport,
  finalizeMonthlyInventoryReport,
  getMonthlyInventoryReport,
  listMonthlyInventoryReports,
  openMonthlyInventoryDraft,
  saveMonthlyInventoryDraft,
} from "../controllers/monthlyInventory.controller";

const router = express.Router();

router.get("/", protect, allowRoles("doctor", "nurse"), listMonthlyInventoryReports);
router.post("/drafts", protect, allowRoles("nurse"), validateBody(monthlyInventoryPeriodSchema), openMonthlyInventoryDraft);
router.put("/:id/draft", protect, allowRoles("nurse"), validateBody(monthlyInventoryDraftSchema), saveMonthlyInventoryDraft);
router.post("/:id/finalize", protect, allowRoles("nurse"), finalizeMonthlyInventoryReport);
router.get("/:id/export", protect, allowRoles("doctor", "nurse"), exportMonthlyInventoryReport);
router.get("/:id", protect, allowRoles("doctor", "nurse"), getMonthlyInventoryReport);

export default router;
