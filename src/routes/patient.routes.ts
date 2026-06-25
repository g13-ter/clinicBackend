import express from "express";

import {
  createPatient,
  getPatients,
  getPatientsBasic,
  getPatientById,
  updatePatient,
  archivePatient,
} from "../controllers/patient.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createPatientSchema, updatePatientSchema } from "../validators/schemas";

const router = express.Router();


// Nurse only - create patient
router.post(
  "/",
  protect,
  allowRoles("nurse"),
  validateBody(createPatientSchema),
  createPatient
);


// Staff - basic info list only
router.get(
  "/basic",
  protect,
  allowRoles("staff"),
  getPatientsBasic
);


// Doctor + Nurse - full patient list
router.get(
  "/",
  protect,
  allowRoles("doctor", "nurse"),
  getPatients
);


// Doctor + Nurse - view single patient (full info)
router.get(
  "/:id",
  protect,
  allowRoles("doctor", "nurse"),
  getPatientById
);


// Admin only - update basic patient info (not medical data)
router.put(
  "/:id",
  protect,
  allowRoles("admin"),
  validateBody(updatePatientSchema),
  updatePatient
);


// Admin only - archive (soft delete) a patient
router.delete(
  "/:id",
  protect,
  allowRoles("admin"),
  archivePatient
);

export default router;