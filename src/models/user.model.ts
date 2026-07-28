import mongoose, { Schema, Document } from "mongoose";
import type { UserRole } from "../types/roles";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
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
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      required: true,
      enum: ["admin", "doctor", "nurse", "staff"],
    },

    isAvailable: { type: Boolean, default: true },
    scheduleNotes: String,
  },
  {
    timestamps: true,
  }
);


const User = mongoose.model<IUser>("User", UserSchema);


export default User;
