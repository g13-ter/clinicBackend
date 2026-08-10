import mongoose, { Schema, Document } from "mongoose";
import { USER_ROLES, type UserRole } from "../types/roles";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  sessionVersion: number;
  termsAccepted: boolean;
  termsAcceptedAt?: Date | null;
  termsVersionAccepted?: string | null;
  deactivatedAt?: Date;
  deactivatedBy?: mongoose.Types.ObjectId;
  isAvailable: boolean;
  scheduleNotes?: string;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      required: true,
      enum: USER_ROLES,
    },

    isActive: { type: Boolean, default: true, index: true },
    sessionVersion: { type: Number, default: 0, select: false },
    termsAccepted: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date, default: null },
    termsVersionAccepted: { type: String, default: null },
    deactivatedAt: Date,
    deactivatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    isAvailable: { type: Boolean, default: true },
    scheduleNotes: String,
  },
  {
    timestamps: true,
  }
);


const User = mongoose.model<IUser>("User", UserSchema);


export default User;
