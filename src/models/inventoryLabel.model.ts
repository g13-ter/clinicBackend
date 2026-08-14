import mongoose, { Document, Schema } from "mongoose";

export interface IInventoryLabel extends Document {
  name: string;
  normalizedName: string;
  description?: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdBy: mongoose.Types.ObjectId;
  archivedAt?: Date;
  archivedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryLabelSchema = new Schema<IInventoryLabel>({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  normalizedName: { type: String, required: true, unique: true, index: true },
  description: { type: String, trim: true, maxlength: 300 },
  color: { type: String, required: true, default: "#64748b", match: /^#[0-9a-fA-F]{6}$/ },
  sortOrder: { type: Number, required: true, default: 0, index: true },
  isActive: { type: Boolean, required: true, default: true, index: true },
  isSystem: { type: Boolean, required: true, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  archivedAt: Date,
  archivedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export default mongoose.model<IInventoryLabel>("InventoryLabel", InventoryLabelSchema);
