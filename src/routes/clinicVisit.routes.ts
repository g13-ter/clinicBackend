import express from "express";

import {
  createVisit,
  getVisitsByPatient,
  getVisitById,
  updateVisit,
  archiveVisit
} from "../controllers/clinicVisit.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createVisitSchema, updateVisitSchema } from "../validators/schemas";

const router = express.Router();


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


// Admin only - archive (soft delete) a visit
router.delete(
  "/:id",
  protect,
  allowRoles("admin"),
  archiveVisit
);

export default router;