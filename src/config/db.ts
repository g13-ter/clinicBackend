import mongoose from "mongoose";
import logger from "../utils/logger";
import { transactionsEnabled } from "../utils/transaction";

interface MongoHello {
  setName?: string;
  msg?: string;
}

const connectDB = async (): Promise<void> => {
  await mongoose.connect(process.env.MONGO_URI as string, {
    autoIndex: process.env.NODE_ENV !== "production",
    serverSelectionTimeoutMS: 10_000,
  });

  if (transactionsEnabled()) {
    const hello = (await mongoose.connection.db!.admin().command({ hello: 1 })) as MongoHello;
    const supportsTransactions = Boolean(hello.setName) || hello.msg === "isdbgrid";

    if (!supportsTransactions) {
      await mongoose.connection.close();
      throw new Error(
        "MongoDB transactions are enabled, but this server is not a replica set or sharded cluster. " +
          "Use MongoDB Atlas/a replica set, or disable transactions only for local development.",
      );
    }
  }

  logger.info("mongodb_connected");
};

export default connectDB;
