import mongoose, { Schema } from "mongoose";

export interface IRateLimitBucket {
  _id: string;
  totalHits: number;
  resetTime: Date;
}

const RateLimitBucketSchema = new Schema<IRateLimitBucket>(
  {
    _id: { type: String, required: true },
    totalHits: { type: Number, required: true },
    resetTime: { type: Date, required: true },
  },
  { versionKey: false },
);

// resetTime is maintained for every bucket, so MongoDB can expire both new
// and existing records without a separate expiresAt field.
RateLimitBucketSchema.index({ resetTime: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRateLimitBucket>("RateLimitBucket", RateLimitBucketSchema);
