import express from "express";
import { getMonthlyVisits, getComplaints } from "../controllers/analytics.controller";
import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = express.Router();

// Monthly visits for charting - nurse, doctor, admin
router.get("/visits-monthly", protect, allowRoles("nurse", "doctor", "admin"), getMonthlyVisits);

// Complaint counts for a given range - nurse, doctor, admin
router.get("/complaints", protect, allowRoles("nurse", "doctor", "admin"), getComplaints);

export default router;
