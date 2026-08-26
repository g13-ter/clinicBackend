import express from "express";

import {
  createPatient,
  getPatients,
  getPatientsBasic,
  getPatientById,
  updatePatient,
  archivePatient,
  advanceStudentSchoolYear,
  reviewStudentCompletion,
  updateClinicalProfile,
} from "../controllers/patient.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import {
  advanceSchoolYearSchema,
  createPatientSchema,
  reviewStudentCompletionSchema,
  updatePatientSchema,
  updateClinicalProfileSchema,
} from "../validators/schemas";

const router = express.Router();


// Student staff and nurse - register a student
router.post(
  "/",
  protect,
  allowRoles("staff", "nurse"),
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

router.post(
  "/school-year/advance",
  protect,
  allowRoles("admin", "superadmin"),
  validateBody(advanceSchoolYearSchema),
  advanceStudentSchoolYear,
);

router.put(
  "/:id/completion-review",
  protect,
  allowRoles("admin"),
  validateBody(reviewStudentCompletionSchema),
  reviewStudentCompletion,
);


// Student staff and clinical roles - demographic patient list
router.get(
  "/",
  protect,
  allowRoles("staff", "doctor", "nurse", "admin"),
  getPatients
);


// Student staff and clinical roles - view demographic profile
router.get(
  "/:id",
  protect,
  allowRoles("staff", "doctor", "nurse"),
  getPatientById
);


// Student staff and nurse - update demographic/contact information only
router.put(
  "/:id/clinical-profile",
  protect,
  allowRoles("nurse", "doctor"),
  validateBody(updateClinicalProfileSchema),
  updateClinicalProfile,
);

router.put(
  "/:id",
  protect,
  allowRoles("staff", "nurse"),
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
