import mongoose, { Schema, Document } from "mongoose";

export interface IMedicine extends Document {
  name: string;
  category?: string;
  quantity: number;
  unit: string;
  expiryDate: Date;
  lowStockThreshold: number;
  supplier?: string;
  dateReceived?: Date;
  lastUpdatedBy: mongoose.Types.ObjectId;
}

const MedicineSchema = new Schema<IMedicine>(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },

    // Free text keeps categories configurable.
    category: {
      type: String,
    },

    quantity: {
      type: Number,
      required: true,
      default: 0,
    },

    unit: {
      type: String,
      required: true,
    },

    expiryDate: {
      type: Date,
    },

    lowStockThreshold: {
      type: Number,
      default: 10,
    },

    supplier: {
      type: String,
    },

    dateReceived: {
      type: Date,
      default: Date.now,
    },

    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

const Medicine = mongoose.model<IMedicine>("Medicine", MedicineSchema);

export default Medicine;
