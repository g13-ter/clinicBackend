import type {
  ClientRateLimitInfo,
  IncrementResponse,
  Options,
  Store,
} from "express-rate-limit";
import RateLimitBucket from "../models/rateLimitBucket.model";

// A Mongo-backed limiter keeps login protection consistent across web
// instances. Buckets expire through MongoDB's TTL index.
export class MongoRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;
  private windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const bucket = await RateLimitBucket.findById(this.key(key)).lean();
    if (!bucket || bucket.resetTime.getTime() <= Date.now()) return undefined;
    return { totalHits: bucket.totalHits, resetTime: bucket.resetTime };
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = new Date();
    const nextReset = new Date(now.getTime() + this.windowMs);
    const activeWindow = { $gt: [{ $ifNull: ["$resetTime", new Date(0)] }, now] };
    const bucket = await RateLimitBucket.findOneAndUpdate(
      { _id: this.key(key) },
      [
        {
          $set: {
            resetTime: {
              $cond: [activeWindow, "$resetTime", nextReset],
            },
            totalHits: {
              $cond: [
                activeWindow,
                { $add: [{ $ifNull: ["$totalHits", 0] }, 1] },
                1,
              ],
            },
          },
        },
      ],
      { upsert: true, returnDocument: "after", updatePipeline: true },
    ).lean();

    if (!bucket) throw new Error("Rate-limit bucket could not be updated");
    return { totalHits: bucket.totalHits, resetTime: bucket.resetTime };
  }

  async decrement(key: string): Promise<void> {
    await RateLimitBucket.updateOne(
      { _id: this.key(key), totalHits: { $gt: 0 } },
      { $inc: { totalHits: -1 } },
    );
  }

  async resetKey(key: string): Promise<void> {
    await RateLimitBucket.deleteOne({ _id: this.key(key) });
  }
}