import express from "express";

import {
  createVisit,
  getVisitsByPatient,
  getVisitById,
  updateVisit,
  archiveVisit,
  getTodayVisitCount,
  getQueue,
  markReadyForDoctor,
  updateVisitStatus,
  downloadReferralForm,
} from "../controllers/clinicVisit.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createVisitSchema, updateVisitSchema, updateVisitStatusSchema } from "../validators/schemas";

const router = express.Router();


// Nurse + Doctor + Admin - count of visits recorded today
router.get(
  "/today-count",
  protect,
  allowRoles("nurse", "doctor", "admin"),
  getTodayVisitCount
);


// Staff, nurse, and doctor - clinic-wide queue containing clinical details.
// Must come before "/:id" so "queue" isn't swallowed as an :id param.
router.get(
  "/queue",
  protect,
  allowRoles("staff", "nurse", "doctor"),
  getQueue
);


// Staff checks in and nurses may create triage/clinical visit records.
router.post(
  "/",
  protect,
  allowRoles("staff", "nurse"),
  validateBody(createVisitSchema),
  createVisit
);


// Doctor + Nurse - view all visits for a patient
router.get(
  "/patient/:patientId",
  protect,
  allowRoles("doctor", "nurse"),
  getVisitsByPatient
);


// Doctor + Nurse - view single visit
router.get(
  "/:id",
  protect,
  allowRoles("doctor", "nurse"),
  getVisitById
);


// Nurses and doctors update the active clinical record.
router.put(
  "/:id",
  protect,
  allowRoles("nurse", "doctor"),
  validateBody(updateVisitSchema),
  updateVisit
);


// Nurse only - mark a patient ready for the doctor after triage/vitals
router.put(
  "/:id/ready",
  protect,
  allowRoles("nurse"),
  markReadyForDoctor
);

router.get(
  "/:id/referral-form",
  protect,
  allowRoles("nurse", "doctor"),
  downloadReferralForm,
);

router.put(
  "/:id/status",
  protect,
  allowRoles("nurse", "doctor"),
  validateBody(updateVisitStatusSchema),
  updateVisitStatus
);


// Admin only - archive (soft delete) a visit
router.delete(
  "/:id",
  protect,
  allowRoles("admin"),
  archiveVisit
);

export default router;
