import mongoose, { Schema, Document } from "mongoose";

// Real-world inventory restock workflow:
//   Nurse detects low stock -> submits a Purchase Request
//   Admin reviews -> approves or rejects
//   If approved, purchasing happens outside the system; once supplies
//   arrive, the nurse updates the Medicine record's stock quantity
//   directly (see medicine.routes.ts) - this model only tracks the
//   request/approval decision itself, not the physical stock change.

export type PurchaseRequestStatus = "pending" | "approved" | "rejected";

export interface IPurchaseRequest extends Document {
  medicineId: mongoose.Types.ObjectId;
  itemName: string; // snapshot of the medicine's name at request time, so the
                     // request stays readable even if the medicine is later renamed/removed
  quantityRequested: number;
  reason: string;
  status: PurchaseRequestStatus;
  requestedBy: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewNotes?: string;
  reviewedAt?: Date;
}

const PurchaseRequestSchema = new Schema<IPurchaseRequest>(
  {
    medicineId: {
      type: Schema.Types.ObjectId,
      ref: "Medicine",
      required: true,
      index: true,
    },

    itemName: {
      type: String,
      required: true,
    },

    quantityRequested: {
      type: Number,
      required: true,
      min: 1,
    },

    reason: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    reviewNotes: {
      type: String,
    },

    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const PurchaseRequest = mongoose.model<IPurchaseRequest>(
  "PurchaseRequest",
  PurchaseRequestSchema
);

export default PurchaseRequest;