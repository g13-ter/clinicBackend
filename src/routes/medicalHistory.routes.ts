import express from "express";

import {
  createMedicalHistory,
  getHistoryByPatient,
  getHistoryById,
  updateMedicalHistory
} from "../controllers/medicalHistory.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createMedicalHistorySchema, updateMedicalHistorySchema } from "../validators/schemas";

const router = express.Router();


// Doctor only - create new entry
router.post(
  "/",
  protect,
  allowRoles("doctor"),
  validateBody(createMedicalHistorySchema),
  createMedicalHistory
);

// Doctor + Nurse (read-only for nurse, enforced by allowing GET only)
router.get("/patient/:patientId", protect, allowRoles("doctor", "nurse"), getHistoryByPatient);

router.get("/:id", protect, allowRoles("doctor", "nurse"), getHistoryById);

// Doctor only - update
router.put(
  "/:id",
  protect,
  allowRoles("doctor"),
  validateBody(updateMedicalHistorySchema),
  updateMedicalHistory
);

export default router;