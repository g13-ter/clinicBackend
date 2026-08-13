import express from "express";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import {
  archiveInventoryLabel, assignInventoryLabel, createInventoryLabel, listInventoryLabels,
  mergeInventoryLabels, reorderInventoryLabels, updateInventoryLabel, listInventoryLabelActivity,
} from "../controllers/inventoryLabel.controller";
import {
  assignInventoryLabelSchema, createInventoryLabelSchema, mergeInventoryLabelsSchema,
  reorderInventoryLabelsSchema, updateInventoryLabelSchema,
} from "../validators/schemas";

const router = express.Router();
router.get("/", protect, allowRoles("doctor", "nurse"), listInventoryLabels);
router.use(protect, allowRoles("nurse"));
router.get("/activity", listInventoryLabelActivity);
router.post("/", validateBody(createInventoryLabelSchema), createInventoryLabel);
router.put("/order", validateBody(reorderInventoryLabelsSchema), reorderInventoryLabels);
router.put("/:id", validateBody(updateInventoryLabelSchema), updateInventoryLabel);
router.post("/:id/assign", validateBody(assignInventoryLabelSchema), assignInventoryLabel);
router.post("/:id/merge", validateBody(mergeInventoryLabelsSchema), mergeInventoryLabels);
router.delete("/:id", archiveInventoryLabel);
export default router;
