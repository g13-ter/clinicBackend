import mongoose, { Schema } from "mongoose";

export interface IRateLimitBucket {
  _id: string;
  totalHits: number;
  resetTime: Date;
  expiresAt: Date;
}

const RateLimitBucketSchema = new Schema<IRateLimitBucket>(
  {
    _id: { type: String, required: true },
    totalHits: { type: Number, required: true },
    resetTime: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

RateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRateLimitBucket>("RateLimitBucket", RateLimitBucketSchema);
