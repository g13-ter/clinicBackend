import mongoose, { Document, Schema } from "mongoose";

export interface IInventoryBatch extends Document {
  medicineId: mongoose.Types.ObjectId;
  batchNumber: string;
  quantityReceived: number;
  quantityRemaining: number;
  expiryDate?: Date;
  supplier?: string;
  receivedAt: Date;
  receivedBy: mongoose.Types.ObjectId;
  notes?: string;
}

const InventoryBatchSchema = new Schema<IInventoryBatch>(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: "Medicine", required: true, index: true },
    batchNumber: { type: String, required: true },
    quantityReceived: { type: Number, required: true, min: 1 },
    quantityRemaining: { type: Number, required: true, min: 0 },
    expiryDate: Date,
    supplier: String,
    receivedAt: { type: Date, default: Date.now },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    notes: String,
  },
  { timestamps: true }
);

InventoryBatchSchema.index({ medicineId: 1, batchNumber: 1 }, { unique: true });

export default mongoose.model<IInventoryBatch>("InventoryBatch", InventoryBatchSchema);
