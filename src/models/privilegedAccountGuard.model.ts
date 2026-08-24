import mongoose, { Document, Schema } from "mongoose";

interface IPrivilegedAccountGuard extends Document {
  key: "privileged-account-invariant";
  revision: number;
}

const PrivilegedAccountGuardSchema = new Schema<IPrivilegedAccountGuard>({
  key: { type: String, default: "privileged-account-invariant", unique: true },
  revision: { type: Number, default: 0 },
});

export default mongoose.model<IPrivilegedAccountGuard>(
  "PrivilegedAccountGuard",
  PrivilegedAccountGuardSchema,
);
