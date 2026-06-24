import mongoose, { Schema, Document } from "mongoose";

export interface IMedicalHistory extends Document {

  patientId: mongoose.Types.ObjectId;

  bloodType: string;

  allergies: string[];

  currentMedications: string[];

  pastIllnesses: string[];

  pastSurgeries: string[];

  familyHistory: string[];

  immunizations: string[];

  notes: string;

}

const MedicalHistorySchema = new Schema<IMedicalHistory>(
  {

    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      unique: true,   // one record per patient
    },

    bloodType: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    },

    allergies: {
      type: [String],
      default: [],
    },

    currentMedications: {
      type: [String],
      default: [],
    },

    pastIllnesses: {
      type: [String],
      default: [],
    },

    pastSurgeries: {
      type: [String],
      default: [],
    },

    familyHistory: {
      type: [String],
      default: [],
    },

    immunizations: {
      type: [String],
      default: [],
    },

    notes: {
      type: String,
      default: "",
    },

  },

  {
    timestamps: true,
  }
);

const MedicalHistory = mongoose.model<IMedicalHistory>(
  "MedicalHistory",
  MedicalHistorySchema
);

export default MedicalHistory;