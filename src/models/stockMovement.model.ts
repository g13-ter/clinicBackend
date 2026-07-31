import mongoose, { Document, Schema } from "mongoose";

export type StockMovementType =
  | "initial_stock"
  | "received"
  | "dispensed"
  | "adjustment"
  | "expired"
  | "damaged";

export interface IStockMovement extends Document {
  medicineId: mongoose.Types.ObjectId;
  batchId?: mongoose.Types.ObjectId;
  visitId?: mongoose.Types.ObjectId;
  type: StockMovementType;
  quantityChange: number;
  balanceAfter: number;
  occurredAt: Date;
  performedBy: mongoose.Types.ObjectId;
  notes?: string;
}

const StockMovementSchema = new Schema<IStockMovement>(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: "Medicine", required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: "InventoryBatch" },
    visitId: { type: Schema.Types.ObjectId, ref: "ClinicVisit" },
    type: {
      type: String,
      enum: ["initial_stock", "received", "dispensed", "adjustment", "expired", "damaged"],
      required: true,
      index: true,
    },
    quantityChange: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    notes: String,
  },
  { timestamps: true },
);

StockMovementSchema.index({ medicineId: 1, occurredAt: -1 });

export default mongoose.model<IStockMovement>("StockMovement", StockMovementSchema);
