import express from "express";

import {
  createMedicine,
  getMedicines,
  getMedicineById,
  updateMedicine,
  getLowStockMedicines,
  getExpiringMedicines,
  getPrescriptionMedicines,
  deleteMedicine,
} from "../controllers/medicine.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createMedicineSchema, createInventoryBatchSchema, updateMedicineSchema } from "../validators/schemas";
import { createInventoryBatch, getInventoryBatches } from "../controllers/inventoryBatch.controller";

const router = express.Router();


// Nurse only - add new medicine
router.post(
  "/",
  protect,
  allowRoles("nurse"),
  validateBody(createMedicineSchema),
  createMedicine
);


// Nurse-only inventory monitoring.
router.get(
  "/low-stock",
  protect,
  allowRoles("nurse"),
  getLowStockMedicines
);


// Nurse + Doctor + Admin - expiring/expired alert list
router.get(
  "/expiring",
  protect,
  allowRoles("nurse"),
  getExpiringMedicines
);

router.post("/:id/batches", protect, allowRoles("nurse"), validateBody(createInventoryBatchSchema), createInventoryBatch);
router.get("/:id/batches", protect, allowRoles("nurse"), getInventoryBatches);

// Minimal, read-only medicine data for the prescription workflow.
router.get("/prescription-search", protect, allowRoles("doctor", "nurse"), getPrescriptionMedicines);


// Nurse + Doctor - view all medicines
router.get(
  "/",
  protect,
  allowRoles("nurse"),
  getMedicines
);


// Nurse + Doctor - view single medicine
router.get(
  "/:id",
  protect,
  allowRoles("nurse"),
  getMedicineById
);


// Nurse only - update quantity/details
router.put(
  "/:id",
  protect,
  allowRoles("nurse"),
  validateBody(updateMedicineSchema),
  updateMedicine
);

router.delete("/:id", protect, allowRoles("nurse"), deleteMedicine);

export default router;
