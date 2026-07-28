import mongoose, { Schema, Document } from "mongoose";

// Tracks restock approval; purchasing and stock updates happen separately.

export type PurchaseRequestStatus =
  | "pending"
  | "approved"
  | "ordered"
  | "received"
  | "rejected"
  | "cancelled";

export interface IPurchaseRequest extends Document {
  medicineId?: mongoose.Types.ObjectId;
  requestType: "restock" | "new_item";
  itemName: string; // snapshot of the medicine's name at request time, so the
                     // request stays readable even if the medicine is later renamed/removed
  unit?: string;
  category?: string;
  quantityRequested: number;
  reason: string;
  status: PurchaseRequestStatus;
  requestedBy: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewNotes?: string;
  reviewedAt?: Date;
  orderedAt?: Date;
  receivedAt?: Date;
  receivedBy?: mongoose.Types.ObjectId;
  supplier?: string;
  estimatedCost?: number;
}

const PurchaseRequestSchema = new Schema<IPurchaseRequest>(
  {
    medicineId: {
      type: Schema.Types.ObjectId,
      ref: "Medicine",
      index: true,
    },

    requestType: {
      type: String,
      enum: ["restock", "new_item"],
      required: true,
      index: true,
    },

    itemName: {
      type: String,
      required: true,
    },

    unit: String,
    category: String,

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
      enum: ["pending", "approved", "ordered", "received", "rejected", "cancelled"],
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
    orderedAt: Date,
    receivedAt: Date,
    receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
    supplier: String,
    estimatedCost: { type: Number, min: 0 },
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
