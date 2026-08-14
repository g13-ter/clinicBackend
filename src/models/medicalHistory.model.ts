import mongoose, { Schema, Document } from "mongoose";

export interface IPrescribedItem {
  medicineId: mongoose.Types.ObjectId;
  medicineName: string; // snapshot at prescribing time, so this stays
                        // readable even if the medicine is later renamed/removed
  quantity: number;
  unit: string; // snapshot, same reasoning as medicineName
  instructions?: string;
  route?: string;
  scheduledTime?: string;
}

export interface IMedicalHistory extends Document {
  patientId: mongoose.Types.ObjectId;
  visitId?: mongoose.Types.ObjectId;
  diagnosis: string;
  prescription: string;
  // Stock-linked items are ordered by an authorized doctor or covering nurse and dispensed by a nurse.
  prescribedItems?: IPrescribedItem[];
  medicationStatus?: "pending" | "accepted" | "dispensing" | "dispensed" | "not_given" | "cancelled";
  medicationClaimedBy?: mongoose.Types.ObjectId;
  medicationClaimedAt?: Date;
  medicationDispensedBy?: mongoose.Types.ObjectId;
  medicationDispensedAt?: Date;
  medicationAdministrationNotes?: string;
  medicationNotGivenReason?: string;
  medicationNotGivenNotes?: string;
  medicationAdverseReaction?: string;
  medicationAdverseReactionAt?: Date;
  medicationAdverseReactionReportedBy?: mongoose.Types.ObjectId;
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
    route: String,
    scheduledTime: String,
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
    // One clinical visit can produce only one final medical-history record.
    visitId: { type: Schema.Types.ObjectId, ref: "ClinicVisit", unique: true, sparse: true },

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

    medicationStatus: {
      type: String,
      enum: ["pending", "accepted", "dispensing", "dispensed", "not_given", "cancelled"],
    },

    medicationClaimedBy: { type: Schema.Types.ObjectId, ref: "User" },
    medicationClaimedAt: Date,

    medicationDispensedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    medicationDispensedAt: Date,
    medicationAdministrationNotes: String,
    medicationNotGivenReason: String,
    medicationNotGivenNotes: String,
    medicationAdverseReaction: String,
    medicationAdverseReactionAt: Date,
    medicationAdverseReactionReportedBy: { type: Schema.Types.ObjectId, ref: "User" },

    // Optional laboratory request, such as CBC or urinalysis.
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
