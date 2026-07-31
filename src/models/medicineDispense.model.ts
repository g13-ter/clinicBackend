import mongoose, { Document, Schema } from "mongoose";

export interface IMedicineDispense extends Document {
  visitId: mongoose.Types.ObjectId;
  medicineId: mongoose.Types.ObjectId;
  quantity: number;
  unit: string;
  instructions?: string;
  batchAllocations?: { batchId: mongoose.Types.ObjectId; batchNumber: string; quantity: number }[];
  dispensedBy: mongoose.Types.ObjectId;
}

const MedicineDispenseSchema = new Schema<IMedicineDispense>({
  visitId: { type: Schema.Types.ObjectId, ref: "ClinicVisit", required: true, index: true },
  medicineId: { type: Schema.Types.ObjectId, ref: "Medicine", required: true },
  quantity: { type: Number, required: true, min: 1 },
  unit: { type: String, required: true },
  instructions: String,
  batchAllocations: [{
    _id: false,
    batchId: { type: Schema.Types.ObjectId, ref: "InventoryBatch", required: true },
    batchNumber: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
  }],
  dispensedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

export default mongoose.model<IMedicineDispense>("MedicineDispense", MedicineDispenseSchema);
