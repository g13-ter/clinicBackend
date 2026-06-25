import express from "express";

import {
  createMedicine,
  getMedicines,
  getMedicineById,
  updateMedicine,
  getLowStockMedicines
} from "../controllers/medicine.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createMedicineSchema, updateMedicineSchema } from "../validators/schemas";

const router = express.Router();


// Nurse only - add new medicine
router.post(
  "/",
  protect,
  allowRoles("nurse"),
  validateBody(createMedicineSchema),
  createMedicine
);


// Nurse + Doctor - low stock alert list
router.get(
  "/low-stock",
  protect,
  allowRoles("nurse", "doctor"),
  getLowStockMedicines
);


// Nurse + Doctor - view all medicines
router.get(
  "/",
  protect,
  allowRoles("nurse", "doctor"),
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