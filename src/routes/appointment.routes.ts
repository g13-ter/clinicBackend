import express from "express";

import {
  createAppointment,
  checkInAppointment,
  completeAppointment,
  confirmAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment
} from "../controllers/appointment.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createAppointmentSchema, updateAppointmentSchema } from "../validators/schemas";

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

router.post(
  "/:id/check-in",
  protect,
  allowRoles("staff", "nurse", "doctor"),
  checkInAppointment
);


// Staff, Nurse, Doctor, Admin - view all appointments
router.get(
  "/",
  protect,
  allowRoles("staff", "nurse", "doctor", "admin"),
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
