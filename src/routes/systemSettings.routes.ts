import express from "express";
import {
  getSystemSettings,
  getClinicProfile,
  updateClinicProfile,
  updateSystemSettings,
} from "../controllers/systemSettings.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { clinicProfileSchema, updateSystemSettingsSchema } from "../validators/schemas";

const router = express.Router();

router.get("/clinic-profile", getClinicProfile);
router.put(
  "/clinic-profile",
  protect,
  allowRoles("nurse", "admin", "superadmin"),
  validateBody(clinicProfileSchema),
  updateClinicProfile,
);

router.get("/", protect, allowRoles("admin", "superadmin"), getSystemSettings);
router.put(
  "/",
  protect,
  allowRoles("admin", "superadmin"),
  validateBody(updateSystemSettingsSchema),
  updateSystemSettings,
);

export default router;
