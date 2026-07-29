import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./config/db";
import { startBackgroundJobs } from "./jobs/backgroundJobs";
import { validateEnv } from "./utils/validateEnv";
import logger from "./utils/logger";

dotenv.config();
validateEnv();

let shuttingDown = false;
let jobs: ReturnType<typeof startBackgroundJobs> | undefined;

const start = async (): Promise<void> => {
  await connectDB();
  jobs = startBackgroundJobs();
  logger.info("Background worker started");
};

const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received - stopping background worker`);
  jobs?.stop();
  await mongoose.connection.close().catch((error) => {
    logger.error("Worker database shutdown failed:", error);
  });
  process.exit(exitCode);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled worker promise rejection:", reason);
  void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (error) => {
  logger.error("Uncaught worker exception:", error);
  void shutdown("uncaughtException", 1);
});

void start().catch((error) => {
  logger.error("Background worker startup failed:", error);
  void shutdown("startupFailure", 1);
});
