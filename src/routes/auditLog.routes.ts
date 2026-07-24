import express from "express";
import { getAuditLogs } from "../controllers/auditLog.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();

router.get(
  "/",
  protect,
  allowRoles("admin"),
  getAuditLogs
);

export default router;