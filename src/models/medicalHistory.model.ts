import mongoose, { Schema, Document } from "mongoose";

export interface IPrescribedItem {
  medicineId: mongoose.Types.ObjectId;
  medicineName: string; // snapshot at prescribing time, so this stays
                        // readable even if the medicine is later renamed/removed
  quantity: number;
  unit: string; // snapshot, same reasoning as medicineName
  instructions?: string;
}

export interface IMedicalHistory extends Document {
  patientId: mongoose.Types.ObjectId;
  diagnosis: string;
  prescription: string;
  // Structured, stock-linked prescription lines - each one is validated
  // against and deducted from real Medicine inventory at creation time
  // (see medicalHistory.service.ts). `prescription` above remains free
  // text for general notes/instructions that aren't tied to a specific
  // inventory item.
  prescribedItems?: IPrescribedItem[];
  labRequest?: string;
  familyHistory: string;
  allergies: string;
  recordedBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  dateRecorded: Date;
}

const PrescribedItemSchema = new Schema<IPrescribedItem>(
  {
    medicineId: {
      type: Schema.Types.ObjectId,
      ref: "Medicine",
      required: true,
    },
    medicineName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unit: {
      type: String,
      required: true,
    },
    instructions: {
      type: String,
    },
  },
  { _id: false }
);

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

    prescribedItems: {
      type: [PrescribedItemSchema],
      default: undefined,
    },

    // Optional laboratory test request the doctor can attach to a
    // consultation (e.g. "CBC", "Urinalysis") - not every visit needs one.
    labRequest: {
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