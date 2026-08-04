import express from "express";

import {
  createAppointment,
  checkInAppointment,
  completeAppointment,
  confirmAppointment,
  declineAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment
} from "../controllers/appointment.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createAppointmentSchema, declineAppointmentSchema, updateAppointmentSchema } from "../validators/schemas";

const router = express.Router();


// Staff, nurse, or doctor - create appointment
router.post(
  "/",
  protect,
  allowRoles("staff", "nurse", "doctor"),
  validateBody(createAppointmentSchema),
  createAppointment
);

router.put(
  "/:id/complete",
  protect,
  allowRoles("nurse", "doctor"),
  completeAppointment
);

router.put(
  "/:id/confirm",
  protect,
  allowRoles("doctor"),
  confirmAppointment,
);

router.put(
  "/:id/decline",
  protect,
  allowRoles("doctor"),
  validateBody(declineAppointmentSchema),
  declineAppointment,
);

router.post(
  "/:id/check-in",
  protect,
  allowRoles("staff", "nurse", "doctor"),
  checkInAppointment
);


// Staff, nurse, and doctor - view appointments containing clinical reasons
router.get(
  "/",
  protect,
  allowRoles("staff", "nurse", "doctor"),
  getAppointments
);


// Staff, Nurse, Doctor - view single appointment
router.get(
  "/:id",
  protect,
  allowRoles("staff", "nurse", "doctor"),
  getAppointmentById
);


// Staff + Nurse - update appointment (including rescheduling and cancelling)
router.put(
  "/:id",
  protect,
  allowRoles("staff", "nurse"),
  validateBody(updateAppointmentSchema),
  updateAppointment
);

export default router;
