import ClinicVisit, { IClinicVisit } from "../models/clinicVisit.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";
import Appointment from "../models/appointment.model";
import { Types } from "mongoose";
import Patient from "../models/patient.model";

type VisitStatus = IClinicVisit["status"];

const ALLOWED_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  triage: ["ready_for_doctor", "in_consultation", "completed", "referred", "cancelled"],
  ready_for_doctor: ["in_consultation", "completed", "referred", "cancelled"],
  in_consultation: ["paused", "completed", "referred", "cancelled"],
  paused: ["in_consultation", "completed", "referred", "cancelled"],
  completed: [],
  cancelled: [],
  referred: [],
};

interface PatientVisitFilter {
  patientId: string;
  isActive: true;
  assignedDoctorId?: string;
  $or?: Array<Record<string, unknown>>;
}

export class ClinicVisitService {
  async createVisit(data: Partial<IClinicVisit>): Promise<IClinicVisit> {
    return await ClinicVisit.create(data);
  }

  async getVisitsByPatient(
    patientId: string,
    { limit, skip }: PaginationParams,
    search?: string,
    assignedDoctorId?: string,
  ): Promise<{ visits: IClinicVisit[]; total: number }> {
    if (!patientId) {
      throw new AppError("Patient ID is required", 400);
    }

    const filter: PatientVisitFilter = {
      patientId,
      isActive: true,
      ...(assignedDoctorId ? { assignedDoctorId } : {}),
    };

    if (search?.trim()) {
      const safeSearch = escapeRegex(search.trim());
      filter.$or = [
        { complaint: { $regex: safeSearch, $options: "i" } },
        { treatment: { $regex: safeSearch, $options: "i" } },
        { notes: { $regex: safeSearch, $options: "i" } },
        { nursingAssessment: { $regex: safeSearch, $options: "i" } },
        { nursingInterventions: { $regex: safeSearch, $options: "i" } },
        { nursingRecommendations: { $regex: safeSearch, $options: "i" } },
        { status: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [visits, total] = await Promise.all([
      ClinicVisit.find(filter)
        .populate("patientId")
        .populate("appointmentId", "appointmentDate reason status")
        .populate("assignedDoctorId", "name role")
        .populate("recordedBy", "name role")
        .populate("updatedBy", "name role")
        .sort({ visitDate: -1 })
        .skip(skip)
        .limit(limit),
      ClinicVisit.countDocuments(filter),
    ]);

    return { visits, total };
  }

  async getLatestRecordedVitals(
    patientId: string,
  ): Promise<{
    heightCm?: number;
    heightRecordedAt?: Date;
    weightKg?: number;
    weightRecordedAt?: Date;
  } | null> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new AppError("Patient ID is invalid", 400);
    }

    const [heightVisit, weightVisit] = await Promise.all([
      ClinicVisit.findOne({ patientId, isActive: true, heightCm: { $gte: 30 } })
        .select("heightCm visitDate")
        .sort({ visitDate: -1, _id: -1 })
        .lean(),
      ClinicVisit.findOne({ patientId, isActive: true, weightKg: { $gte: 1 } })
        .select("weightKg visitDate")
        .sort({ visitDate: -1, _id: -1 })
        .lean(),
    ]);

    if (heightVisit?.heightCm == null && weightVisit?.weightKg == null) return null;
    return {
      ...(heightVisit?.heightCm == null
        ? {}
        : { heightCm: heightVisit.heightCm, heightRecordedAt: heightVisit.visitDate }),
      ...(weightVisit?.weightKg == null
        ? {}
        : { weightKg: weightVisit.weightKg, weightRecordedAt: weightVisit.visitDate }),
    };
  }

  async getVisitById(id: string, assignedDoctorId?: string): Promise<IClinicVisit> {
    const visit = await ClinicVisit.findById(id)
      .populate("patientId")
      .populate("appointmentId", "appointmentDate reason status")
      .populate("assignedDoctorId", "name role")
      .populate("recordedBy", "name role")
      .populate("updatedBy", "name role");

    if (!visit) {
      throw new AppError("Clinic visit not found", 404);
    }

    if (assignedDoctorId) {
      const assigned = visit.assignedDoctorId as unknown as { _id?: unknown } | undefined;
      if (String(assigned?._id ?? assigned ?? "") !== assignedDoctorId) {
        throw new AppError("This visit is assigned to another doctor", 403);
      }
    }

    return visit;
  }

  async updateVisit(id: string, data: Partial<IClinicVisit>): Promise<{ before: IClinicVisit; after: IClinicVisit }> {
    const before = await ClinicVisit.findById(id);

    if (!before) {
      throw new AppError("Clinic visit not found", 404);
    }

    const after = await ClinicVisit.findByIdAndUpdate(id, data, {
      returnDocument: "after",
      runValidators: true,
    });

    if (!after) {
      throw new AppError("Clinic visit not found", 404);
    }

    return { before, after };
  }

  async archiveVisit(id: string, updatedBy: string): Promise<{ before: IClinicVisit; after: IClinicVisit }> {
    const before = await ClinicVisit.findById(id);

    if (!before) {
      throw new AppError("Clinic visit not found", 404);
    }

    const after = await ClinicVisit.findOneAndUpdate(
      { _id: id, status: before.status },
      { isActive: false, updatedBy },
      { returnDocument: "after" }
    );

    if (!after) {
      throw new AppError("Clinic visit not found", 404);
    }

    return { before, after };
  }

  // Return all open visits in FIFO order.
  async getQueue(patientType?: "student" | "teacher" | "staff"): Promise<IClinicVisit[]> {
    const patientQuery: Record<string, unknown> = patientType === "student"
      ? { $or: [{ patientType: "student" }, { patientType: { $exists: false } }] }
      : patientType ? { patientType } : {};
    const patientIds = patientType ? await Patient.find(patientQuery).distinct("_id") : undefined;
    return await ClinicVisit.find({
      isActive: true,
      status: { $in: ["triage", "ready_for_doctor", "in_consultation", "paused"] },
      ...(patientIds ? { patientId: { $in: patientIds } } : {}),
    })
      .populate("patientId", "patientType studentId employeeId firstName lastName department position course yearLevel")
      .populate("appointmentId", "appointmentDate reason status")
      .populate("assignedDoctorId", "name role")
      .populate("recordedBy", "name role")
      // Emergencies always appear first, then preserve FIFO order.
      .sort({ isEmergency: -1, visitDate: 1 });
  }

  async markReadyForDoctor(id: string, updatedBy: string): Promise<{ before: IClinicVisit; after: IClinicVisit }> {
    const before = await ClinicVisit.findById(id);

    if (!before) {
      throw new AppError("Clinic visit not found", 404);
    }
    const missingVitals = [
      !before.bloodPressure ? "blood pressure" : "",
      before.temperature == null ? "temperature" : "",
      before.pulseRate == null ? "pulse rate" : "",
    ].filter(Boolean);
    if (missingVitals.length > 0) {
      throw new AppError(
        `Record ${missingVitals.join(", ")} before marking the patient ready for doctor`,
        409,
      );
    }
    this.assertTransition(before.status, "ready_for_doctor");

    const after = await ClinicVisit.findOneAndUpdate(
      { _id: id, status: before.status },
      { readyForDoctor: true, status: "ready_for_doctor", updatedBy },
      { returnDocument: "after" }
    );

    if (!after) {
      throw new AppError("Clinic visit not found", 404);
    }

    return { before, after };
  }

  async updateStatus(
    id: string,
    data: Pick<IClinicVisit, "status" | "referralFacility" | "referralReason" | "referralOutcome" | "guardianNotifiedAt" | "closureOutcome">,
    updatedBy: string,
    role: "nurse" | "doctor",
  ): Promise<{ before: IClinicVisit; after: IClinicVisit }> {
    const before = await ClinicVisit.findById(id);
    if (!before) throw new AppError("Clinic visit not found", 404);
    this.assertTransition(before.status, data.status);
    const allowedForRole: Record<"nurse" | "doctor", VisitStatus[]> = {
      nurse: ["ready_for_doctor", "completed", "referred", "cancelled"],
      doctor: ["in_consultation", "paused", "completed", "referred", "cancelled"],
    };
    if (!allowedForRole[role].includes(data.status)) {
      throw new AppError(`${role === "nurse" ? "Nurses" : "Doctors"} cannot set visit status to ${data.status}`, 403);
    }
    if (data.status === "ready_for_doctor") {
      const missingVitals = [
        !before.bloodPressure ? "blood pressure" : "",
        before.temperature == null ? "temperature" : "",
        before.pulseRate == null ? "pulse rate" : "",
      ].filter(Boolean);
      if (missingVitals.length > 0) {
        throw new AppError(`Record ${missingVitals.join(", ")} before marking the student ready for doctor`, 409);
      }
    }
    if (role === "doctor") {
      const assigned = before.assignedDoctorId;
      if (assigned && String(assigned) !== updatedBy) {
        throw new AppError("This visit is assigned to another doctor", 403);
      }
      if (data.status === "in_consultation" && !before.readyForDoctor && !before.isEmergency) {
        throw new AppError("A nurse must finish triage before consultation starts", 409);
      }
    }
    if (
      role === "nurse" &&
      data.status === "completed" &&
      (["in_consultation", "paused"].includes(before.status) || before.consultationFindings)
    ) {
      throw new AppError("A visit claimed by a doctor cannot be completed as a nursing assessment", 409);
    }

    const update: Partial<IClinicVisit> = {
      ...data,
      updatedBy: new Types.ObjectId(updatedBy),
    };
    if (role === "doctor" && data.status === "in_consultation" && !before.assignedDoctorId) {
      update.assignedDoctorId = new Types.ObjectId(updatedBy);
    }
    if (data.status === "ready_for_doctor") update.readyForDoctor = true;
    if (data.status === "triage") update.readyForDoctor = false;
    if (data.status === "completed" || data.status === "referred" || data.status === "cancelled") {
      update.closedAt = new Date();
    }
    const after = await ClinicVisit.findOneAndUpdate(
      {
        _id: id,
        status: before.status,
        ...(role === "doctor"
          ? { $or: [{ assignedDoctorId: updatedBy }, { assignedDoctorId: null }] }
          : {}),
      },
      update,
      { returnDocument: "after", runValidators: true },
    );
    if (!after) throw new AppError("Visit changed or was claimed by another clinician; refresh and try again", 409);

    if (before.appointmentId && ["completed", "referred", "cancelled"].includes(data.status)) {
      await Appointment.findByIdAndUpdate(before.appointmentId, {
        status: data.status === "cancelled" ? "cancelled" : "completed",
        updatedBy,
      });
    }
    return { before, after };
  }

  private assertTransition(current: VisitStatus, next: VisitStatus): void {
    if (current === next) return;
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new AppError(`Visit cannot move from ${current} to ${next}`, 409);
    }
  }

  async getTodayCount(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return ClinicVisit.countDocuments({ visitDate: { $gte: start }, isActive: true });
  }
}
