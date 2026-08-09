import mongoose, { Document, Schema } from "mongoose";

export type MonthlyInventoryStatus = "draft" | "finalized";

export interface IMonthlyInventoryItem {
  medicineId: mongoose.Types.ObjectId;
  medicineName: string;
  category?: string;
  unit: string;
  beginningBalance: number;
  receivedQuantity: number;
  dispensedQuantity: number;
  adjustmentQuantity: number;
  damagedLostExpiredQuantity: number;
  calculatedEndingBalance: number;
  physicalCount?: number;
  variance?: number;
  varianceNotes?: string;
  batches: { batchNumber: string; expirationDate?: Date }[];
  availabilityStatus: string;
  lowStockThreshold: number;
  isLowStock: boolean;
  reorderRequired: boolean;
}

export interface IMonthlyInventoryReport extends Document {
  month: number;
  year: number;
  status: MonthlyInventoryStatus;
  items: IMonthlyInventoryItem[];
  preparedBy: mongoose.Types.ObjectId;
  finalizedBy?: mongoose.Types.ObjectId;
  finalizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MonthlyInventoryItemSchema = new Schema<IMonthlyInventoryItem>({
  medicineId: { type: Schema.Types.ObjectId, ref: "Medicine", required: true },
  medicineName: { type: String, required: true },
  category: String,
  unit: { type: String, required: true },
  beginningBalance: { type: Number, required: true, min: 0 },
  receivedQuantity: { type: Number, required: true, min: 0 },
  dispensedQuantity: { type: Number, required: true, min: 0 },
  adjustmentQuantity: { type: Number, required: true },
  damagedLostExpiredQuantity: { type: Number, required: true, min: 0 },
  calculatedEndingBalance: { type: Number, required: true, min: 0 },
  physicalCount: { type: Number, min: 0 },
  variance: Number,
  varianceNotes: String,
  batches: [{
    _id: false,
    batchNumber: { type: String, required: true },
    expirationDate: Date,
  }],
  availabilityStatus: { type: String, required: true },
  lowStockThreshold: { type: Number, required: true, min: 0 },
  isLowStock: { type: Boolean, required: true },
  reorderRequired: { type: Boolean, required: true },
}, { _id: false });

const MonthlyInventoryReportSchema = new Schema<IMonthlyInventoryReport>({
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true, min: 2000, max: 9999 },
  status: { type: String, enum: ["draft", "finalized"], default: "draft", index: true },
  items: { type: [MonthlyInventoryItemSchema], default: [] },
  preparedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  finalizedBy: { type: Schema.Types.ObjectId, ref: "User" },
  finalizedAt: Date,
}, { timestamps: true });

MonthlyInventoryReportSchema.index(
  { year: 1, month: 1, status: 1 },
  { unique: true },
);

export default mongoose.model<IMonthlyInventoryReport>(
  "MonthlyInventoryReport",
  MonthlyInventoryReportSchema,
);
