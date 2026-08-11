import express from "express";
import { handleResendWebhook } from "../controllers/webhook.controller";

const router = express.Router();

router.post("/resend", express.raw({ type: "application/json", limit: "256kb" }), handleResendWebhook);

export default router;
