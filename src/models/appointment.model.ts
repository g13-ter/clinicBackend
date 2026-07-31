import mongoose, { Schema, Document } from "mongoose";

export interface IAppointment extends Document {
  patientId: mongoose.Types.ObjectId;
  doctorId?: mongoose.Types.ObjectId;
  appointmentDate: Date;
  reason: string;
  cancellationReason?: string;
  status: string;
  notes: string;
  reminderSent: boolean;
  reminderClaimedAt?: Date;
  durationMinutes: number;
  type: "regular" | "follow_up";
  sourceVisitId?: mongoose.Types.ObjectId;
  visitId?: mongoose.Types.ObjectId;
  checkedInAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AppointmentSchema = new Schema<IAppointment>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },

    // Optional to support "next available doctor" workflows.
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    appointmentDate: {
      type: Date,
      required: true,
    },

    reason: {
      type: String,
      required: true,
    },

    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "checked_in", "cancelled", "completed"],
      default: "pending",
    },

    notes: {
      type: String,
    },

    // Prevent duplicate reminder emails.
    reminderSent: {
      type: Boolean,
      default: false,
    },

    // Short lease used by reminder workers to prevent duplicate sends.
    reminderClaimedAt: {
      type: Date,
      index: true,
    },

    durationMinutes: {
      type: Number,
      min: 5,
      max: 480,
      default: 30,
    },

    type: {
      type: String,
      enum: ["regular", "follow_up"],
      default: "regular",
      index: true,
    },

    sourceVisitId: {
      type: Schema.Types.ObjectId,
      ref: "ClinicVisit",
    },

    visitId: {
      type: Schema.Types.ObjectId,
      ref: "ClinicVisit",
      index: true,
    },

    checkedInAt: Date,

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

const Appointment = mongoose.model<IAppointment>(
  "Appointment",
  AppointmentSchema
);

export default Appointment;
