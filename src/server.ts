import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./config/db";
import app from "./app";
import { validateEnv } from "./utils/validateEnv";
import logger from "./utils/logger";

dotenv.config();
validateEnv();

connectDB();

const PORT: number = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on Port ${PORT}`);
});

const shutdown = (signal: string): void => {
  logger.info(`${signal} received — closing server`);
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
