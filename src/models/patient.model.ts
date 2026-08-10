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
  email?: string;
  address: string;
  dateOfBirth?: Date;
  bloodType?: string;
  guardianName?: string;
  guardianContactNumber?: string;
  healthConditions?: string;
  familyHistory?: string;
  pastMedicalHistory?: string;
  medicalAlerts?: {
    allergies: string[];
    chronicConditions: string[];
    currentMedications: string[];
    notes?: string;
  };
  clinicalProfileUpdatedBy?: mongoose.Types.ObjectId;
  clinicalProfileVerifiedBy?: mongoose.Types.ObjectId;
  clinicalProfileVerifiedAt?: Date;
  consents?: {
    treatment: boolean;
    medicineAdministration: boolean;
    dataPrivacy: boolean;
    guardianName?: string;
    updatedAt?: Date;
    version?: string;
    source?: "in_person" | "guardian_form";
    recordedBy?: mongoose.Types.ObjectId;
  };
  schoolYear?: string;
  enrollmentStatus: "active" | "graduated" | "transferred";
  immunizations?: { vaccine: string; dateAdministered?: Date; notes?: string }[];
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
      trim: true,
      uppercase: true,
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

    // Optional address for appointment emails.
    email: {
      type: String,
    },

    address: {
      type: String,
      required: true,
    },

    dateOfBirth: Date,
    bloodType: String,
    guardianName: String,
    guardianContactNumber: String,
    healthConditions: String,
    familyHistory: String,
    pastMedicalHistory: String,
    medicalAlerts: {
      allergies: { type: [String], default: [] },
      chronicConditions: { type: [String], default: [] },
      currentMedications: { type: [String], default: [] },
      notes: String,
    },
    clinicalProfileUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    clinicalProfileVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    clinicalProfileVerifiedAt: Date,
    consents: {
      treatment: { type: Boolean, default: false },
      medicineAdministration: { type: Boolean, default: false },
      dataPrivacy: { type: Boolean, default: false },
      guardianName: String,
      updatedAt: Date,
      version: String,
      source: { type: String, enum: ["in_person", "guardian_form"] },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    schoolYear: String,
    enrollmentStatus: {
      type: String,
      enum: ["active", "graduated", "transferred"],
      default: "active",
      index: true,
    },
    immunizations: [{
      vaccine: { type: String, required: true },
      dateAdministered: Date,
      notes: String,
    }],

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
