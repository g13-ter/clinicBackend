import dotenv from "dotenv";
import mongoose from "mongoose";
import "../src/app";
import connectDB from "../src/config/db";
import { validateEnv } from "../src/utils/validateEnv";
import logger from "../src/utils/logger";

dotenv.config();
validateEnv();

const createIndexes = async (): Promise<void> => {
  await connectDB();

  for (const model of Object.values(mongoose.models)) {
    logger.info(`Creating missing indexes for ${model.modelName}`);
    await model.createIndexes();
  }

  await mongoose.connection.close();
  logger.info("Index creation complete");
};

void createIndexes().catch(async (error) => {
  logger.error("Index creation failed:", error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
