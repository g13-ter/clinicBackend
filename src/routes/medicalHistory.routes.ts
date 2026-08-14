import express from "express";

import {
  createMedicalHistory,
  downloadMedicalCertificate,
  getHistoryByPatient,
  getHistoryById,
  updateMedicalHistory
} from "../controllers/medicalHistory.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import {
  adverseReactionSchema,
  createMedicalHistorySchema,
  dispenseMedicationSchema,
  notGivenMedicationSchema,
  updateMedicalHistorySchema,
} from "../validators/schemas";
import {
  claimMedicationOrder,
  dispenseMedicationOrder,
  listMedicationOrders,
  listRecentAdministeredMedications,
  markMedicationNotGiven,
  reportMedicationReaction,
} from "../controllers/medicationDispensing.controller";

const router = express.Router();


// Doctors create consultation records; nurses may create medication orders when providing cover.
router.post(
  "/",
  protect,
  allowRoles("doctor", "nurse"),
  validateBody(createMedicalHistorySchema),
  createMedicalHistory
);

// Doctor + Nurse (read-only for nurse, enforced by allowing GET only)
router.get("/patient/:patientId", protect, allowRoles("doctor", "nurse"), getHistoryByPatient);

router.get("/medication-orders/open", protect, allowRoles("nurse"), listMedicationOrders);
router.get("/medication-orders/recent", protect, allowRoles("nurse"), listRecentAdministeredMedications);

// Doctor only - generate a certificate from a saved physician consultation.
router.get(
  "/:id/certificate",
  protect,
  allowRoles("doctor"),
  downloadMedicalCertificate,
);

// Nurse confirms that the doctor-prescribed medication was actually given.
router.post(
  "/:id/dispense",
  protect,
  allowRoles("nurse"),
  validateBody(dispenseMedicationSchema),
  dispenseMedicationOrder,
);

router.post("/:id/claim", protect, allowRoles("nurse"), claimMedicationOrder);
router.post("/:id/not-given", protect, allowRoles("nurse"), validateBody(notGivenMedicationSchema), markMedicationNotGiven);
router.post("/:id/adverse-reaction", protect, allowRoles("nurse"), validateBody(adverseReactionSchema), reportMedicationReaction);

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
