import dotenv from "dotenv";
import mongoose from "mongoose";
import cron from "node-cron";
import connectDB from "./config/db";
import app from "./app";
import { validateEnv } from "./utils/validateEnv";
import logger from "./utils/logger";
import { sendDueReminders } from "./services/reminder.service";

dotenv.config();
validateEnv();

connectDB();

const PORT: number = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on Port ${PORT}`);
});

// Runs every hour, on the hour. Finds appointments ~24h out and sends a
// reminder email for each (see reminder.service.ts). This keeps working
// as long as this process stays running; on platforms where the process
// restarts frequently, trigger POST /api/internal/send-reminders from an
// external scheduler instead (or in addition - the sweep is idempotent).
const reminderTask = cron.schedule("0 * * * *", async () => {
  try {
    const result = await sendDueReminders();
    logger.info(`Scheduled reminder sweep complete: ${JSON.stringify(result)}`);
  } catch (error) {
    logger.error("Scheduled reminder sweep failed:", error);
  }
});

const shutdown = (signal: string): void => {
  logger.info(`${signal} received — closing server`);
  reminderTask.stop();
  server.close(() => {
    mongoose.connection
      .close()
      .then(() => {
        logger.info("MongoDB connection closed");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Error closing MongoDB connection:", error);
        process.exit(1);
      });
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));