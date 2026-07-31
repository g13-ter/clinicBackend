import dotenv from "dotenv";
import mongoose from "mongoose";
import type { Server } from "node:http";
import connectDB from "./config/db";
import app from "./app";
import { validateEnv } from "./utils/validateEnv";
import logger from "./utils/logger";
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
    logger.info(`Server running on http://${HOST}:${PORT}`);
  });

  const runJobsInApi =
    process.env.RUN_BACKGROUND_JOBS_IN_API === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.RUN_BACKGROUND_JOBS_IN_API !== "false");
  if (runJobsInApi) backgroundJobs = startBackgroundJobs();
};

const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received - draining server`);
  backgroundJobs?.stop();

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
