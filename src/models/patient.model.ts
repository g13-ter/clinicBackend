import mongoose, { Schema, Document } from "mongoose";

export interface IPatient extends Document {
  patientType: "student" | "teacher" | "staff";
  educationLevel?: "elementary" | "junior_high" | "senior_high" | "college";
  studentId: string;
  employeeId?: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: string;
  course?: string;
  yearLevel: number;
  programDurationYears?: number;
  department?: string;
  position?: string;
  contactNumber: string;
  email?: string;
  address: string;
  dateOfBirth?: Date;
  bloodType?: string;
  guardianName?: string;
  guardianContactNumber?: string;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
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
  schoolYear?: string;
  enrollmentStatus: "active" | "completion_pending" | "extended" | "graduated" | "transferred";
  completionReviewDecision?: "graduated" | "retained" | "extended" | "transferred";
  completionReviewNotes?: string;
  completionReviewedAt?: Date;
  completionReviewedBy?: mongoose.Types.ObjectId;
  immunizations?: { vaccine: string; dateAdministered?: Date; notes?: string }[];
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
}

const PatientSchema = new Schema<IPatient>(
  {
    patientType: {
      type: String,
      enum: ["student", "teacher", "staff"],
      default: "student",
      required: true,
      index: true,
    },
    educationLevel: {
      type: String,
      enum: ["elementary", "junior_high", "senior_high", "college"],
      default: function (this: IPatient): string | undefined {
        return this.patientType === "student" ? "college" : undefined;
      },
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    employeeId: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      index: true,
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
      required: function (this: IPatient): boolean {
        return this.patientType === "student" && (this.educationLevel ?? "college") === "college";
      },
      trim: true,
    },

    yearLevel: {
      type: Number,
      required: function (this: IPatient): boolean { return this.patientType === "student"; },
      default: 1,
    },
    programDurationYears: {
      type: Number,
      min: 1,
      max: 10,
      default: function (this: IPatient): number | undefined {
        return this.patientType === "student" && (this.educationLevel ?? "college") === "college" ? 4 : undefined;
      },
    },
    department: String,
    position: String,

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
    emergencyContactName: String,
    emergencyContactNumber: String,
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
    schoolYear: String,
    enrollmentStatus: {
      type: String,
      enum: ["active", "completion_pending", "extended", "graduated", "transferred"],
      default: "active",
      index: true,
    },
    completionReviewDecision: {
      type: String,
      enum: ["graduated", "retained", "extended", "transferred"],
    },
    completionReviewNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    completionReviewedAt: Date,
    completionReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
