import express from "express";
import { protect } from "../middleware/auth.middleware";

// import tanan controller functions
import {
  createPatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient
} from "../controllers/patient.controller";

const router = express.Router();

// CREATE
router.post("/", createPatient);

// READ ALL
router.get("/", protect, getPatients);

// READ ONE
router.get("/:id", getPatientById);

// UPDATE
router.put("/:id", updatePatient);

// DELETE
router.delete("/:id", deletePatient);

export default router;