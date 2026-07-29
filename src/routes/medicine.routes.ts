import express from "express";

import {
  createMedicine,
  getMedicines,
  getMedicineById,
  updateMedicine,
  getLowStockMedicines,
  getExpiringMedicines
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


// Nurse + Doctor + Admin - low stock alert list
router.get(
  "/low-stock",
  protect,
  allowRoles("nurse", "doctor", "admin"),
  getLowStockMedicines
);


// Nurse + Doctor + Admin - expiring/expired alert list
router.get(
  "/expiring",
  protect,
  allowRoles("nurse", "doctor", "admin"),
  getExpiringMedicines
);

router.post("/:id/batches", protect, allowRoles("nurse"), validateBody(createInventoryBatchSchema), createInventoryBatch);
router.get("/:id/batches", protect, allowRoles("nurse", "doctor", "admin"), getInventoryBatches);


// Nurse + Doctor - view all medicines
router.get(
  "/",
  protect,
  allowRoles("admin", "nurse", "doctor"),
  getMedicines
);


// Nurse + Doctor - view single medicine
router.get(
  "/:id",
  protect,
  allowRoles("nurse", "doctor"),
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

export default router;
