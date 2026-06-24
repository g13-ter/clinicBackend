import express from "express";

import {
  createMedicalHistory,
  getMedicalHistoryByPatient,
  updateMedicalHistory
} from "../controllers/medicalHistory.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();


// Nurse creates the initial record during patient enrollment
router.post(
  "/",
  protect,
  allowRoles("nurse"),
  createMedicalHistory
);


// Doctor + Nurse can view
router.get(
  "/patient/:patientId",
  protect,
  allowRoles("doctor", "nurse"),
  getMedicalHistoryByPatient
);


// Doctor + Nurse can update (add new medications, allergies, etc.)
router.put(
  "/patient/:patientId",
  protect,
  allowRoles("doctor", "nurse"),
  updateMedicalHistory
);


export default router;