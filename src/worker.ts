import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./config/db";
import { startBackgroundJobs } from "./jobs/backgroundJobs";
import { validateEnv } from "./utils/validateEnv";
import logger, { errorMetadata } from "./utils/logger";

dotenv.config();
validateEnv();

let shuttingDown = false;
let jobs: ReturnType<typeof startBackgroundJobs> | undefined;

const start = async (): Promise<void> => {
  await connectDB();
  jobs = startBackgroundJobs();
  logger.info("worker_started");
};

const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("worker_shutdown_started", { signal });
  jobs?.stop();
  await mongoose.connection.close().catch((error) => {
    logger.error("worker_database_shutdown_failed", errorMetadata(error));
  });
  process.exit(exitCode);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("worker_unhandled_promise_rejection", errorMetadata(reason));
  void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (error) => {
  logger.error("worker_uncaught_exception", errorMetadata(error));
  void shutdown("uncaughtException", 1);
});

void start().catch((error) => {
  logger.error("worker_startup_failed", errorMetadata(error));
  void shutdown("startupFailure", 1);
});
