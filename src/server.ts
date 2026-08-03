import dotenv from "dotenv";
import mongoose from "mongoose";
import type { Server } from "node:http";
import connectDB from "./config/db";
import app from "./app";
import { validateEnv } from "./utils/validateEnv";
import logger, { errorMetadata } from "./utils/logger";
import { startBackgroundJobs } from "./jobs/backgroundJobs";

dotenv.config();
validateEnv();

const PORT = Number(process.env.PORT) || 5000;
const HOST = "0.0.0.0";
let server: Server | undefined;
let backgroundJobs: ReturnType<typeof startBackgroundJobs> | undefined;
let shuttingDown = false;

const start = async (): Promise<void> => {
  await connectDB();

  server = app.listen(PORT, HOST, () => {
    logger.info("server_started", { host: HOST, port: PORT });
  });

  const runJobsInApi =
    process.env.RUN_BACKGROUND_JOBS_IN_API === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.RUN_BACKGROUND_JOBS_IN_API !== "false");
  if (runJobsInApi) backgroundJobs = startBackgroundJobs();
};

const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("server_shutdown_started", { signal });
  backgroundJobs?.stop();

  const forcedExit = setTimeout(() => {
    logger.error("server_shutdown_timed_out");
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
    logger.info("server_shutdown_completed");
    process.exit(exitCode);
  } catch (error) {
    logger.error("server_shutdown_failed", errorMetadata(error));
    process.exit(1);
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_promise_rejection", errorMetadata(reason));
  void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (error) => {
  logger.error("uncaught_exception", errorMetadata(error));
  void shutdown("uncaughtException", 1);
});

void start().catch((error) => {
  logger.error("server_startup_failed", errorMetadata(error));
  void shutdown("startupFailure", 1);
});
