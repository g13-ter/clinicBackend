import mongoose, { Document, Schema } from "mongoose";

export interface ClinicScheduleDay {
  day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  openTime: string;
  closeTime: string;
}

const DEFAULT_WEEKLY_SCHEDULE: ClinicScheduleDay[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => ({
  day: day as ClinicScheduleDay["day"],
  openTime: "08:00",
  closeTime: "17:00",
}));

export const DEFAULT_CLINIC_PROFILE = {
  clinicName: "School Health Clinic",
  buildingLocation: "Main Building",
  floorRoom: "Ground Floor, Room 101",
  operatingDays: "Monday–Friday",
  clinicOpenTime: "08:00",
  clinicCloseTime: "17:00",
  weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
  phoneNumber: "0912 345 6789",
  emailAddress: "clinic@yourschool.edu.ph",
} as const;

export interface ISystemSettings extends Document {
  key: "clinic";
  schoolYear: string;
  clinicName: string;
  buildingLocation: string;
  floorRoom: string;
  operatingDays: string;
  clinicOpenTime: string;
  clinicCloseTime: string;
  weeklySchedule: ClinicScheduleDay[];
  phoneNumber: string;
  emailAddress: string;
  emailNotificationsEnabled: boolean;
  appointmentRemindersEnabled: boolean;
  stockAlertsEnabled: boolean;
  updatedBy?: mongoose.Types.ObjectId;
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
  {
    key: { type: String, enum: ["clinic"], default: "clinic", unique: true },
    schoolYear: { type: String, required: true },
    clinicName: { type: String, required: true, trim: true, default: DEFAULT_CLINIC_PROFILE.clinicName },
    buildingLocation: { type: String, required: true, trim: true, default: DEFAULT_CLINIC_PROFILE.buildingLocation },
    floorRoom: { type: String, required: true, trim: true, default: DEFAULT_CLINIC_PROFILE.floorRoom },
    operatingDays: { type: String, required: true, trim: true, default: DEFAULT_CLINIC_PROFILE.operatingDays },
    clinicOpenTime: { type: String, required: true, default: DEFAULT_CLINIC_PROFILE.clinicOpenTime },
    clinicCloseTime: { type: String, required: true, default: DEFAULT_CLINIC_PROFILE.clinicCloseTime },
    weeklySchedule: {
      type: [{
        _id: false,
        day: { type: String, enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], required: true },
        openTime: { type: String, required: true },
        closeTime: { type: String, required: true },
      }],
      default: () => DEFAULT_WEEKLY_SCHEDULE.map((entry) => ({ ...entry })),
    },
    phoneNumber: { type: String, required: true, trim: true, default: DEFAULT_CLINIC_PROFILE.phoneNumber },
    emailAddress: { type: String, required: true, trim: true, lowercase: true, default: DEFAULT_CLINIC_PROFILE.emailAddress },
    emailNotificationsEnabled: { type: Boolean, default: true },
    appointmentRemindersEnabled: { type: Boolean, default: true },
    stockAlertsEnabled: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export default mongoose.model<ISystemSettings>("SystemSettings", SystemSettingsSchema);
