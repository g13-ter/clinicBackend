import mongoose, { type ClientSession } from "mongoose";

type TransactionWork<T> = (session?: ClientSession) => Promise<T>;

export const transactionsEnabled = (): boolean =>
  process.env.MONGO_TRANSACTIONS_ENABLED === "true" ||
  (process.env.NODE_ENV === "production" && process.env.MONGO_TRANSACTIONS_ENABLED !== "false");

/**
 * Runs multi-document writes atomically in production. Development and test
 * environments may opt in when their MongoDB runs as a replica set.
 */
export async function withMongoTransaction<T>(work: TransactionWork<T>): Promise<T> {
  if (!transactionsEnabled()) return work();

  const session = await mongoose.startSession();
  let result: T | undefined;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
  } finally {
    await session.endSession();
  }

  if (result === undefined) {
    throw new Error("Transaction completed without a result");
  }
  return result;
}
