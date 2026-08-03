import express, { Request, Response, NextFunction } from "express";
import { requireInternalKey } from "../middleware/internalAuth.middleware";
import { sendDueReminders } from "../services/reminder.service";
import logger from "../utils/logger";

const router = express.Router();

// Trigger the reminder sweep from the internal or external scheduler.
router.post("/send-reminders", requireInternalKey, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await sendDueReminders();
    logger.info("manual_reminder_sweep_completed", result);
    res.status(200).json({ success: true, message: "Reminder sweep complete", data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
