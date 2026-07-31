import mongoose, { Document, Schema } from "mongoose";

export interface IReportApproval extends Document {
  periodStart: Date;
  periodEnd: Date;
  preparedBy: mongoose.Types.ObjectId;
  status: "prepared" | "approved";
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  notes?: string;
}

const ReportApprovalSchema = new Schema<IReportApproval>({
  periodStart: { type: Date, required: true }, periodEnd: { type: Date, required: true },
  preparedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["prepared", "approved"], default: "prepared" },
  approvedBy: { type: Schema.Types.ObjectId, ref: "User" }, approvedAt: Date, notes: String,
}, { timestamps: true });
ReportApprovalSchema.index({ periodStart: 1, periodEnd: 1 }, { unique: true });
export default mongoose.model<IReportApproval>("ReportApproval", ReportApprovalSchema);
