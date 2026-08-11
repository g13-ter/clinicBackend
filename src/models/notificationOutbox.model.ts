import mongoose, { Document, Schema } from "mongoose";

export type NotificationKind =
  | "appointment_confirmation"
  | "appointment_doctor_confirmed"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "appointment_reminder"
  | "low_stock"
  | "purchase_request";

export interface INotificationOutbox extends Document {
  kind: NotificationKind;
  recipient: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  status: "pending" | "processing" | "sent" | "failed" | "discarded";
  attempts: number;
  availableAt: Date;
  claimedAt?: Date;
  sentAt?: Date;
  lastError?: string;
  providerMessageId?: string;
  deliveryStatus?: "accepted" | "sent" | "delayed" | "delivered" | "bounced" | "failed" | "complained" | "suppressed";
  deliveryRank: number;
  deliveryUpdatedAt?: Date;
}

const NotificationOutboxSchema = new Schema<INotificationOutbox>({
  kind: {
    type: String,
    enum: [
      "appointment_confirmation",
      "appointment_doctor_confirmed",
      "appointment_rescheduled",
      "appointment_cancelled",
      "appointment_reminder",
      "low_stock",
      "purchase_request",
    ],
    required: true,
    index: true,
  },
  recipient: { type: String, required: true, index: true },
  payload: { type: Schema.Types.Mixed, required: true },
  dedupeKey: { type: String, unique: true, sparse: true },
  status: {
    type: String,
    enum: ["pending", "processing", "sent", "failed", "discarded"],
    default: "pending",
    index: true,
  },
  attempts: { type: Number, default: 0 },
  availableAt: { type: Date, default: Date.now, index: true },
  claimedAt: Date,
  sentAt: Date,
  lastError: String,
  providerMessageId: { type: String, index: true, sparse: true },
  deliveryStatus: {
    type: String,
    enum: ["accepted", "sent", "delayed", "delivered", "bounced", "failed", "complained", "suppressed"],
  },
  deliveryRank: { type: Number, default: 0 },
  deliveryUpdatedAt: Date,
}, { timestamps: true });

NotificationOutboxSchema.index({ status: 1, availableAt: 1, claimedAt: 1 });

export default mongoose.model<INotificationOutbox>("NotificationOutbox", NotificationOutboxSchema);
