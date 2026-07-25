import express from "express";

import {
  createVisit,
  getVisitsByPatient,
  getVisitById,
  updateVisit,
  archiveVisit,
  getTodayVisitCount,
  getQueue,
  markReadyForDoctor
} from "../controllers/clinicVisit.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createVisitSchema, updateVisitSchema } from "../validators/schemas";

const router = express.Router();


// Nurse + Doctor + Admin - count of visits recorded today
router.get(
  "/today-count",
  protect,
  allowRoles("nurse", "doctor", "admin"),
  getTodayVisitCount
);


// Nurse + Doctor + Admin - clinic-wide "who's here right now" queue.
// Must come before "/:id" so "queue" isn't swallowed as an :id param.
router.get(
  "/queue",
  protect,
  allowRoles("nurse", "doctor", "admin"),
  getQueue
);


// Nurse only - create visit
router.post(
  "/",
  protect,
  allowRoles("nurse"),
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


// Nurse only - update their own logged visit
router.put(
  "/:id",
  protect,
  allowRoles("nurse"),
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


// Admin only - archive (soft delete) a visit
router.delete(
  "/:id",
  protect,
  allowRoles("admin"),
  archiveVisit
);

export default router;