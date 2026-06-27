import mongoose, { Schema, Document } from "mongoose";

export interface IMedicine extends Document {
  name: string;
  quantity: number;
  unit: string;
  expiryDate: Date;
  lowStockThreshold: number;
  lastUpdatedBy: mongoose.Types.ObjectId;
}

const MedicineSchema = new Schema<IMedicine>(
  {
    name: {
      type: String,
      required: true,
      index: true,
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