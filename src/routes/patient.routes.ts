import express from "express";

import {
  createPatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
} from "../controllers/patient.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();


// Nurse only create
router.post(
  "/",
  protect,
  allowRoles("nurse"),
  createPatient
);


// Doctor + Nurse view patients
router.get(
  "/",
  protect,
  allowRoles("doctor", "nurse"),
  getPatients
);


// Doctor + Nurse view single patient
router.get(
  "/:id",
  protect,
  allowRoles("doctor", "nurse"),
  getPatientById
);


// Nurse update patient
router.put(
  "/:id",
  protect,
  allowRoles("nurse"),
  updatePatient
);


// Nobody should really delete patients in a clinic
// but if needed admin only
router.delete(
  "/:id",
  protect,
  allowRoles("admin"),
  deletePatient
);

export default router;