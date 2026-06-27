import mongoose, { Schema, Document } from "mongoose";

export interface IPatient extends Document {
  studentId: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: string;
  course: string;
  yearLevel: number;
  contactNumber: string;
  address: string;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
}

const PatientSchema = new Schema<IPatient>(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
    },

    firstName: {
      type: String,
      required: true,
    },

    lastName: {
      type: String,
      required: true,
    },

    age: {
      type: Number,
      required: true,
    },

    gender: {
      type: String,
      enum: ["Male", "Female"],
      required: true,
    },

    course: {
      type: String,
      required: true,
    },

    yearLevel: {
      type: Number,
      required: true,
    },

    contactNumber: {
      type: String,
      required: true,
    },

    address: {
      type: String,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },

  {
    timestamps: true,
  }
);

const Patient = mongoose.model<IPatient>("Patient", PatientSchema);

export default Patient;