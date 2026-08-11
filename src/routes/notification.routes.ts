import express from "express";
import {
  getMyNotifications,
  getNotificationDeliveryHistory,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from "../controllers/notification.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();
router.get("/", protect, getMyNotifications);
router.put("/read-all", protect, markAllMyNotificationsRead);
router.put("/:id/read", protect, markMyNotificationRead);
router.get("/delivery-history", protect, allowRoles("admin", "superadmin"), getNotificationDeliveryHistory);
export default router;
