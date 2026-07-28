import express from "express";
import { getHealth, getLiveness } from "../controllers/health.controller";

const router = express.Router();

router.get("/", getHealth);
router.get("/ready", getHealth);
router.get("/live", getLiveness);

export default router;
