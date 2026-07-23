import express, { Request, Response, NextFunction } from "express";
import { requireInternalKey } from "../middleware/internalAuth.middleware";
import { sendDueReminders } from "../services/reminder.service";
import logger from "../utils/logger";

const router = express.Router();

// POST /api/internal/send-reminders
// Triggers the 24h-before appointment reminder sweep. Called either by
// the in-process node-cron job (server.ts) or, in environments where the
// process doesn't stay running continuously, by an external scheduler
// (e.g. Railway Cron, a GitHub Actions cron job) hitting this endpoint
// with the X-Internal-Api-Key header.
router.post("/send-reminders", requireInternalKey, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await sendDueReminders();
    logger.info(`Reminder sweep complete: ${JSON.stringify(result)}`);
    res.status(200).json({ success: true, message: "Reminder sweep complete", data: result });
  } catch (error) {
    next(error);
  }
});

export default router;