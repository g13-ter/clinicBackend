import mongoose, { Document, Schema } from "mongoose";

export interface ISystemSettings extends Document {
  key: "clinic";
  schoolYear: string;
  clinicOpenTime: string;
  clinicCloseTime: string;
  emailNotificationsEnabled: boolean;
  appointmentRemindersEnabled: boolean;
  stockAlertsEnabled: boolean;
  updatedBy?: mongoose.Types.ObjectId;
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
  {
    key: { type: String, enum: ["clinic"], default: "clinic", unique: true },
    schoolYear: { type: String, required: true },
    clinicOpenTime: { type: String, required: true, default: "08:00" },
    clinicCloseTime: { type: String, required: true, default: "17:00" },
    emailNotificationsEnabled: { type: Boolean, default: true },
    appointmentRemindersEnabled: { type: Boolean, default: true },
    stockAlertsEnabled: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export default mongoose.model<ISystemSettings>("SystemSettings", SystemSettingsSchema);
