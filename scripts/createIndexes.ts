import dotenv from "dotenv";
import mongoose from "mongoose";
import "../src/app";
import connectDB from "../src/config/db";
import { validateEnv } from "../src/utils/validateEnv";
import logger from "../src/utils/logger";

const TERMINAL_OUTBOX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

dotenv.config();
validateEnv();

const createIndexes = async (): Promise<void> => {
  await connectDB();

  for (const model of Object.values(mongoose.models)) {
    logger.info(`Creating missing indexes for ${model.modelName}`);
    await model.createIndexes();

    const obsoleteIndexes: Record<string, string[]> = {
      RateLimitBucket: ["expiresAt_1"],
      StockMovement: ["medicineId_1"],
      InAppNotification: ["userId_1"],
    };
    const indexesToDrop = obsoleteIndexes[model.modelName] ?? [];
    if (indexesToDrop.length > 0) {
      const indexes = await model.collection.listIndexes().toArray();
      for (const indexName of indexesToDrop) {
        if (indexes.some((index) => index.name === indexName)) {
          logger.info(`Dropping obsolete ${model.modelName} index ${indexName}`);
          await model.collection.dropIndex(indexName);
        }
      }
    }

    if (model.modelName === "NotificationOutbox") {
      // Start retention for existing terminal records from their last update.
      await model.updateMany(
        { status: { $in: ["sent", "failed", "discarded"] }, expiresAt: { $exists: false } },
        [{
          $set: {
            expiresAt: {
              $add: [{ $ifNull: ["$updatedAt", "$createdAt"] }, TERMINAL_OUTBOX_RETENTION_MS],
            },
          },
        }],
      );
    }
  }

  await mongoose.connection.close();
  logger.info("Index creation complete");
};

void createIndexes().catch(async (error) => {
  logger.error("Index creation failed:", error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
