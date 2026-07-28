import dotenv from "dotenv";
import mongoose from "mongoose";
import cron from "node-cron";
import type { Server } from "node:http";
import connectDB from "./config/db";
import app from "./app";
import { validateEnv } from "./utils/validateEnv";
import logger from "./utils/logger";
import { sendDueReminders } from "./services/reminder.service";
import { processNotificationOutbox } from "./services/notificationOutbox.service";

dotenv.config();
validateEnv();

const PORT = Number(process.env.PORT) || 5000;
let server: Server | undefined;
let reminderTask: ReturnType<typeof cron.schedule> | undefined;
let notificationTask: ReturnType<typeof cron.schedule> | undefined;
let shuttingDown = false;

const start = async (): Promise<void> => {
  await connectDB();

  server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  // Database claims make this safe when several API instances run the job.
  reminderTask = cron.schedule("0 * * * *", async () => {
    try {
      const result = await sendDueReminders();
      logger.info(`Scheduled reminder sweep complete: ${JSON.stringify(result)}`);
    } catch (error) {
      logger.error("Scheduled reminder sweep failed:", error);
    }
  });

  notificationTask = cron.schedule("* * * * *", async () => {
    try {
      const result = await processNotificationOutbox();
      if (result.processed > 0) logger.info(`Notification outbox processed: ${JSON.stringify(result)}`);
    } catch (error) {
      logger.error("Notification outbox processing failed:", error);
    }
  });
  void processNotificationOutbox().catch((error) => logger.error("Initial notification outbox processing failed:", error));
};

const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received - draining server`);
  reminderTask?.stop();
  notificationTask?.stop();

  const forcedExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forcedExit.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve());
      });
    }
    await mongoose.connection.close();
    clearTimeout(forcedExit);
    logger.info("Server shutdown complete");
    process.exit(exitCode);
  } catch (error) {
    logger.error("Graceful shutdown failed:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection:", reason);
  void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  void shutdown("uncaughtException", 1);
});

void start().catch((error) => {
  logger.error("Server startup failed:", error);
  void shutdown("startupFailure", 1);
});
