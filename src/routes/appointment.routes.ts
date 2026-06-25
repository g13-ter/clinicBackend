import express from "express";

import {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment
} from "../controllers/appointment.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createAppointmentSchema, updateAppointmentSchema } from "../validators/schemas";

const router = express.Router();


// Staff only - create appointment
router.post(
  "/",
  protect,
  allowRoles("staff"),
  validateBody(createAppointmentSchema),
  createAppointment
);


// Staff, Nurse, Doctor - view all appointments
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


// Staff only - update appointment (including cancelling)
router.put(
  "/:id",
  protect,
  allowRoles("staff"),
  validateBody(updateAppointmentSchema),
  updateAppointment
);

export default router;