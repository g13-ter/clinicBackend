import mongoose, { Document, Schema } from "mongoose";

export type InAppNotificationKind =
  | "appointment_assigned"
  | "appointment_reassigned"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "visit_ready"
  | "emergency"
  | "medication_order";

export interface IInAppNotification extends Document {
  userId: mongoose.Types.ObjectId;
  kind: InAppNotificationKind;
  title: string;
  message: string;
  link: string;
  resourceType: "Appointment" | "ClinicVisit" | "MedicalHistory";
  resourceId: string;
  readAt?: Date;
  dedupeKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const InAppNotificationSchema = new Schema<IInAppNotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: {
      type: String,
      enum: [
        "appointment_assigned",
        "appointment_reassigned",
        "appointment_rescheduled",
        "appointment_cancelled",
        "visit_ready",
        "emergency",
        "medication_order",
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    link: { type: String, required: true },
    resourceType: { type: String, enum: ["Appointment", "ClinicVisit", "MedicalHistory"], required: true },
    resourceId: { type: String, required: true, index: true },
    readAt: Date,
    dedupeKey: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

InAppNotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export default mongoose.model<IInAppNotification>(
  "InAppNotification",
  InAppNotificationSchema,
);
