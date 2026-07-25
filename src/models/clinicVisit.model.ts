import mongoose, { Schema, Document } from "mongoose";

export interface IClinicVisit extends Document {
  patientId: mongoose.Types.ObjectId;
  complaint: string;
  treatment: string;
  notes: string;
  visitDate: Date;
  bloodPressure: string;
  temperature: number;
  pulseRate: number;
  // Set by the nurse once vitals/triage are done and the patient is ready
  // to see the doctor. Distinguishes "waiting for triage" from "waiting
  // for doctor" within the set of still-open (isActive: true) visits -
  // isActive itself just means "not yet archived", it doesn't track where
  // in the process a visit currently is.
  readyForDoctor: boolean;
  recordedBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  isActive: boolean;
}

const ClinicVisitSchema = new Schema<IClinicVisit>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },

    complaint: {
      type: String,
      required: true,
    },

    treatment: {
      type: String,
    },

    notes: {
      type: String,
    },

    visitDate: {
      type: Date,
      default: Date.now,
    },

    bloodPressure: {
      type: String,
    },

    temperature: {
      type: Number,
    },

    pulseRate: {
      type: Number,
    },

    readyForDoctor: {
      type: Boolean,
      default: false,
    },

    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },

  {
    timestamps: true,
  }
);

const ClinicVisit = mongoose.model<IClinicVisit>("ClinicVisit", ClinicVisitSchema);

export default ClinicVisit;