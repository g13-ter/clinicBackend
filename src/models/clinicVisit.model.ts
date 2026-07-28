import mongoose, { Schema, Document } from "mongoose";

export interface IClinicVisit extends Document {
  patientId: mongoose.Types.ObjectId;
  appointmentId?: mongoose.Types.ObjectId;
  assignedDoctorId?: mongoose.Types.ObjectId;
  complaint: string;
  treatment: string;
  notes: string;
  visitDate: Date;
  bloodPressure: string;
  temperature: number;
  pulseRate: number;
  // Distinguishes patients awaiting triage from those ready for a doctor.
  readyForDoctor: boolean;
  status: "triage" | "ready_for_doctor" | "in_consultation" | "paused" | "completed" | "cancelled" | "referred";
  referralFacility?: string;
  referralReason?: string;
  referralOutcome?: string;
  isEmergency: boolean;
  emergencyDetails?: string;
  guardianNotifiedAt?: Date;
  closedAt?: Date;
  closureOutcome?: "returned_to_class" | "sent_home" | "guardian_pickup" | "referred" | "cancelled" | "physician_consultation";
  respiratoryRate?: number;
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
  nursingAssessment?: string;
  consultationFindings?: string;
  nursingInterventions?: string;
  nursingRecommendations?: string;
  clinicProtocolReference?: string;
  recordedBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  isActive: boolean;
}

const ClinicVisitSchema = new Schema<IClinicVisit>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },

    complaint: {
      type: String,
      required: true,
    },

    treatment: {
      type: String,
    },

    notes: {
      type: String,
    },

    visitDate: {
      type: Date,
      default: Date.now,
    },

    bloodPressure: {
      type: String,
    },

    temperature: {
      type: Number,
    },

    pulseRate: {
      type: Number,
    },

    readyForDoctor: {
      type: Boolean,
      default: false,
    },

    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: "Appointment",
      unique: true,
      sparse: true,
    },

    assignedDoctorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    status: {
      type: String,
      enum: ["triage", "ready_for_doctor", "in_consultation", "paused", "completed", "cancelled", "referred"],
      default: "triage",
      index: true,
    },
    referralFacility: String,
    referralReason: String,
    referralOutcome: String,
    isEmergency: { type: Boolean, default: false },
    emergencyDetails: String,
    guardianNotifiedAt: Date,
    closedAt: Date,
    closureOutcome: {
      type: String,
      enum: ["returned_to_class", "sent_home", "guardian_pickup", "referred", "cancelled", "physician_consultation"],
    },
    respiratoryRate: Number,
    heightCm: Number,
    weightKg: Number,
    bmi: Number,
    nursingAssessment: String,
    consultationFindings: String,
    nursingInterventions: String,
    nursingRecommendations: String,
    clinicProtocolReference: String,

    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },

  {
    timestamps: true,
  }
);

const ClinicVisit = mongoose.model<IClinicVisit>("ClinicVisit", ClinicVisitSchema);

export default ClinicVisit;
