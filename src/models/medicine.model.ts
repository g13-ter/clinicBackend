import mongoose, { Schema, Document } from "mongoose";

export interface IMedicine extends Document {
  name: string;
  category?: string;
  inventorySection?: string;
  quantity: number;
  unit: string;
  expiryDate: Date;
  lowStockThreshold: number;
  supplier?: string;
  dateReceived?: Date;
  isActive: boolean;
  discontinuedAt?: Date;
  discontinuedBy?: mongoose.Types.ObjectId;
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

    // Display heading used to group items in the inventory register.
    inventorySection: {
      type: String,
      trim: true,
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

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    discontinuedAt: Date,

    discontinuedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
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
