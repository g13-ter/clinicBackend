import mongoose, { Schema, Document } from "mongoose";

export interface IMedicalHistory extends Document {
  patientId: mongoose.Types.ObjectId;
  diagnosis: string;
  prescription: string;
  familyHistory: string;
  allergies: string;
  recordedBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  dateRecorded: Date;
}

const MedicalHistorySchema = new Schema<IMedicalHistory>(
  {
   patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },

    diagnosis: {
      type: String,
    },

    prescription: {
      type: String,
    },

    familyHistory: {
      type: String,
    },

    allergies: {
      type: String,
    },

    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    dateRecorded: {
      type: Date,
      default: Date.now,
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