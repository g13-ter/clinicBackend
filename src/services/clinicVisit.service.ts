import ClinicVisit, { IClinicVisit } from "../models/clinicVisit.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";
import Appointment from "../models/appointment.model";
import { Types } from "mongoose";

type VisitStatus = IClinicVisit["status"];

const ALLOWED_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  triage: ["ready_for_doctor", "in_consultation", "completed", "referred", "cancelled"],
  ready_for_doctor: ["in_consultation", "paused", "completed", "referred", "cancelled"],
  in_consultation: ["paused", "completed", "referred", "cancelled"],
  paused: ["in_consultation", "completed", "referred", "cancelled"],
  completed: [],
  cancelled: [],
  referred: [],
};

interface PatientVisitFilter {
  patientId: string;
  isActive: true;
  complaint?: { $regex: string; $options: "i" };
}

export class ClinicVisitService {
  async createVisit(data: Partial<IClinicVisit>): Promise<IClinicVisit> {
    return await ClinicVisit.create(data);
  }

  async getVisitsByPatient(
    patientId: string,
    { limit, skip }: PaginationParams,
    search?: string
  ): Promise<{ visits: IClinicVisit[]; total: number }> {
    if (!patientId) {
      throw new AppError("Patient ID is required", 400);
    }

    const filter: PatientVisitFilter = {
      patientId,
      isActive: true,
    };

    if (search) {
      filter.complaint = { $regex: escapeRegex(search), $options: "i" };
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

  async getVisitById(id: string): Promise<IClinicVisit> {
    const visit = await ClinicVisit.findById(id)
      .populate("patientId")
      .populate("appointmentId", "appointmentDate reason status")
      .populate("assignedDoctorId", "name role")
      .populate("recordedBy", "name role")
      .populate("updatedBy", "name role");

    if (!visit) {
      throw new AppError("Clinic visit not found", 404);
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

    const after = await ClinicVisit.findByIdAndUpdate(
      id,
      { isActive: false, updatedBy },
      { returnDocument: "after" }
    );

    if (!after) {
      throw new AppError("Clinic visit not found", 404);
    }

    return { before, after };
  }

  // Return all open visits in FIFO order.
  async getQueue(): Promise<IClinicVisit[]> {
    return await ClinicVisit.find({ isActive: true, status: { $in: ["triage", "ready_for_doctor", "in_consultation", "paused"] } })
      .populate("patientId", "studentId firstName lastName")
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
        `Record ${missingVitals.join(", ")} before marking the student ready for doctor`,
        409,
      );
    }
    this.assertTransition(before.status, "ready_for_doctor");

    const after = await ClinicVisit.findByIdAndUpdate(
      id,
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
  ): Promise<{ before: IClinicVisit; after: IClinicVisit }> {
    const before = await ClinicVisit.findById(id);
    if (!before) throw new AppError("Clinic visit not found", 404);
    this.assertTransition(before.status, data.status);

    const update: Partial<IClinicVisit> = {
      ...data,
      updatedBy: new Types.ObjectId(updatedBy),
    };
    if (data.status === "ready_for_doctor") update.readyForDoctor = true;
    if (data.status === "triage") update.readyForDoctor = false;
    if (data.status === "completed" || data.status === "referred" || data.status === "cancelled") {
      update.closedAt = new Date();
    }
    const after = await ClinicVisit.findByIdAndUpdate(id, update, { returnDocument: "after", runValidators: true });
    if (!after) throw new AppError("Clinic visit not found", 404);

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
