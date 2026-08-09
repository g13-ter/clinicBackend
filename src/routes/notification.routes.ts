import express from "express";
import { getNotificationDeliveryHistory } from "../controllers/notification.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();
router.get("/delivery-history", protect, allowRoles("admin", "superadmin"), getNotificationDeliveryHistory);
export default router;
