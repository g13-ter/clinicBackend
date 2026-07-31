import dotenv from "dotenv";
import mongoose from "mongoose";
import "../src/app";
import connectDB from "../src/config/db";
import Patient from "../src/models/patient.model";
import User from "../src/models/user.model";
import { validateEnv } from "../src/utils/validateEnv";
import logger from "../src/utils/logger";

dotenv.config();

const fail = (message: string): never => {
  throw new Error(`Production preflight failed: ${message}`);
};

const run = async (): Promise<void> => {
  if (process.env.NODE_ENV !== "production") {
    fail("NODE_ENV must be production");
  }
  validateEnv();
  if (!process.env.RESEND_API_KEY) fail("RESEND_API_KEY is required");
  if (!process.env.EMAIL_FROM || process.env.EMAIL_FROM.includes("yourdomain.com")) {
    fail("EMAIL_FROM must use the verified production mail domain");
  }
  if (!process.env.RELEASE_SHA || process.env.RELEASE_SHA === "development") {
    fail("RELEASE_SHA must identify the deployed commit");
  }
  if (process.env.RUN_BACKGROUND_JOBS_IN_API === "true") {
    fail("RUN_BACKGROUND_JOBS_IN_API must be false; deploy the dedicated worker");
  }

  await connectDB();

  const activeAdmins = await User.countDocuments({ role: "admin", isActive: { $ne: false } });
  if (activeAdmins < 1) fail("at least one active administrator is required");

  const [duplicateStudent] = await Patient.aggregate<{ _id: string; count: number }>([
    { $group: { _id: { $toUpper: "$studentId" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
  if (duplicateStudent) fail(`duplicate student ID detected: ${duplicateStudent._id}`);

  const [duplicateEmail] = await User.aggregate<{ _id: string; count: number }>([
    { $group: { _id: { $toLower: "$email" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
  if (duplicateEmail) fail(`duplicate user email detected: ${duplicateEmail._id}`);

  for (const model of Object.values(mongoose.models)) {
    const difference = await model.diffIndexes();
    if (difference.toCreate.length > 0) {
      fail(`${model.modelName} is missing ${difference.toCreate.length} database index(es)`);
    }
  }

  logger.info("Production preflight passed");
  await mongoose.connection.close();
};

void run().catch(async (error) => {
  logger.error(error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
