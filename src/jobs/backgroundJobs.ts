import cron from "node-cron";
import logger from "../utils/logger";
import { sendDueReminders } from "../services/reminder.service";
import { processNotificationOutbox } from "../services/notificationOutbox.service";

export interface BackgroundJobs {
  stop: () => void;
}

export const startBackgroundJobs = (): BackgroundJobs => {
  const reminderTask = cron.schedule("0 * * * *", async () => {
    try {
      const result = await sendDueReminders();
      logger.info(`Scheduled reminder sweep complete: ${JSON.stringify(result)}`);
    } catch (error) {
      logger.error("Scheduled reminder sweep failed:", error);
    }
  });

  const notificationTask = cron.schedule("* * * * *", async () => {
    try {
      const result = await processNotificationOutbox();
      if (result.processed > 0) {
        logger.info(`Notification outbox processed: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      logger.error("Notification outbox processing failed:", error);
    }
  });

  void processNotificationOutbox().catch((error) => {
    logger.error("Initial notification outbox processing failed:", error);
  });

  return {
    stop: () => {
      reminderTask.stop();
      notificationTask.stop();
    },
  };
};
