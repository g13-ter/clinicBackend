import cron from "node-cron";
import logger, { errorMetadata } from "../utils/logger";
import { sendDueReminders } from "../services/reminder.service";
import { processNotificationOutbox } from "../services/notificationOutbox.service";

export interface BackgroundJobs {
  stop: () => void;
}

export const startBackgroundJobs = (): BackgroundJobs => {
  const reminderTask = cron.schedule("0 * * * *", async () => {
    try {
      const result = await sendDueReminders();
      logger.info("scheduled_reminder_sweep_completed", result);
    } catch (error) {
      logger.error("scheduled_reminder_sweep_failed", errorMetadata(error));
    }
  });

  const notificationTask = cron.schedule("* * * * *", async () => {
    try {
      const result = await processNotificationOutbox();
      if (result.processed > 0) {
        logger.info("notification_outbox_processed", result);
      }
    } catch (error) {
      logger.error("notification_outbox_processing_failed", errorMetadata(error));
    }
  });

  void processNotificationOutbox().catch((error) => {
    logger.error("initial_notification_outbox_processing_failed", errorMetadata(error));
  });

  return {
    stop: () => {
      reminderTask.stop();
      notificationTask.stop();
    },
  };
};
