import Appointment, { IAppointment } from "../models/appointment.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";
import type { UserRole } from "../types/roles";
import ClinicVisit, { IClinicVisit } from "../models/clinicVisit.model";
import { Types, type ClientSession } from "mongoose";
import { clinicDayRange } from "../utils/clinicTime";

const isDuplicateKeyError = (error: unknown): error is { code: number } =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

interface AppointmentListFilter {
  reason?: { $regex: string; $options: "i" };
  appointmentDate?: { $gte: Date; $lt: Date };
  doctorId?: string | { $exists: false };
}

export class AppointmentService {
  async createAppointment(data: Partial<IAppointment>, session?: ClientSession): Promise<IAppointment> {
    await this.assertNoDoctorConflict(data.doctorId, data.appointmentDate, data.durationMinutes, undefined, "pending", session);
    const appointment = new Appointment(data);
    return await appointment.save(session ? { session } : undefined);
  }

  async getAppointments(
    { limit, skip }: PaginationParams,
    search?: string,
    filters?: { date?: string | undefined; doctorId?: string | undefined; unassignedOnly?: boolean | undefined }
  ): Promise<{ appointments: IAppointment[]; total: number }> {
    const filter: AppointmentListFilter = {};

    if (search) {
      filter.reason = { $regex: escapeRegex(search), $options: "i" };
    }

    // Restrict results to one local calendar day.
    if (filters?.date) {
      try {
        const { start, endExclusive } = clinicDayRange(filters.date);
        filter.appointmentDate = { $gte: start, $lt: endExclusive };
      } catch {
        throw new AppError("date must be a valid date (YYYY-MM-DD)", 400);
      }
    }

    if (filters?.unassignedOnly) {
      filter.doctorId = { $exists: false };
    } else if (filters?.doctorId) {
      filter.doctorId = filters.doctorId;
    }

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .populate("patientId", "studentId firstName lastName")
        .populate("doctorId", "name role")
        .populate("visitId", "status readyForDoctor")
        .populate("createdBy", "name role")
        .populate("updatedBy", "name role")
        .sort({ appointmentDate: 1 })
        .skip(skip)
        .limit(limit),
      Appointment.countDocuments(filter),
    ]);

    return { appointments, total };
  }

  async getAppointmentById(id: string): Promise<IAppointment> {
    const appointment = await Appointment.findById(id)
      .populate("patientId", "studentId firstName lastName")
      .populate("doctorId", "name role")
      .populate("visitId", "status readyForDoctor")
      .populate("createdBy", "name role")
      .populate("updatedBy", "name role");

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    return appointment;
  }

  async updateAppointment(id: string, data: Partial<IAppointment>, session?: ClientSession): Promise<{ before: IAppointment; after: IAppointment }> {
    const before = await Appointment.findById(id).session(session ?? null);

    if (!before) {
      throw new AppError("Appointment not found", 404);
    }

    const reminderDetailsChanged =
      (data.appointmentDate !== undefined &&
        new Date(data.appointmentDate).getTime() !== before.appointmentDate.getTime()) ||
      (data.doctorId !== undefined &&
        String(data.doctorId) !== String(before.doctorId ?? ""));
    if (reminderDetailsChanged) {
      data.reminderSent = false;
      if (data.status !== "cancelled") {
        // A changed doctor or schedule must be confirmed again.
        data.status = "pending";
      }
    }

    await this.assertNoDoctorConflict(
      data.doctorId === undefined ? before.doctorId : data.doctorId,
      data.appointmentDate === undefined ? before.appointmentDate : data.appointmentDate,
      data.durationMinutes === undefined ? before.durationMinutes : data.durationMinutes,
      id,
      data.status === undefined ? before.status : data.status,
      session,
    );

    const after = await Appointment.findByIdAndUpdate(id, data, {
      returnDocument: "after",
      runValidators: true,
      ...(session ? { session } : {}),
    });

    if (!after) {
      throw new AppError("Appointment not found", 404);
    }

    if (reminderDetailsChanged) {
      await Appointment.updateOne(
        { _id: id },
        { $unset: { reminderClaimedAt: 1 } },
        session ? { session } : undefined,
      );
    }

    return { before, after };
  }

  async completeAppointment(
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<{ before: IAppointment; after: IAppointment }> {
    const before = await Appointment.findById(id);
    if (!before) throw new AppError("Appointment not found", 404);

    if (
      role === "doctor" &&
      before.doctorId &&
      String(before.doctorId) !== userId
    ) {
      throw new AppError("You can only complete your own appointments", 403);
    }

    const after = await Appointment.findByIdAndUpdate(
      id,
      {
        status: "completed",
        updatedBy: userId,
        ...(role === "doctor" && !before.doctorId ? { doctorId: userId } : {}),
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!after) throw new AppError("Appointment not found", 404);
    return { before, after };
  }

  async confirmAppointment(
    id: string,
    doctorId: string,
    session?: ClientSession,
  ): Promise<{ before: IAppointment; after: IAppointment }> {
    const before = await Appointment.findById(id).session(session ?? null);
    if (!before) throw new AppError("Appointment not found", 404);
    if (!before.doctorId || String(before.doctorId) !== doctorId) {
      throw new AppError("You can only confirm appointments assigned to you", 403);
    }
    if (before.status === "confirmed") {
      return { before, after: before };
    }
    if (before.status !== "pending") {
      throw new AppError("Only pending appointments can be confirmed", 409);
    }

    const after = await Appointment.findByIdAndUpdate(
      id,
      { status: "confirmed", updatedBy: doctorId },
      { returnDocument: "after", runValidators: true, ...(session ? { session } : {}) },
    );
    if (!after) throw new AppError("Appointment not found", 404);
    return { before, after };
  }

  async checkInAppointment(
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<{ appointment: IAppointment; visit: IClinicVisit; created: boolean }> {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new AppError("Appointment not found", 404);
    if (appointment.status === "cancelled" || appointment.status === "completed") {
      throw new AppError("Only active appointments can be checked in", 409);
    }
    if (
      role === "doctor" &&
      (!appointment.doctorId || String(appointment.doctorId) !== userId)
    ) {
      throw new AppError("You can only start your assigned appointments", 403);
    }

    if (appointment.visitId) {
      const linkedVisit = await ClinicVisit.findById(appointment.visitId);
      if (linkedVisit) return { appointment, visit: linkedVisit, created: false };
    }

    const existingVisit = await ClinicVisit.findOne({ appointmentId: appointment._id });
    if (existingVisit) {
      appointment.visitId = new Types.ObjectId(String(existingVisit._id));
      appointment.checkedInAt ??= new Date();
      appointment.status = "checked_in";
      appointment.updatedBy = new Types.ObjectId(userId);
      await appointment.save();
      return { appointment, visit: existingVisit, created: false };
    }

    try {
      const visit = new ClinicVisit({
        patientId: appointment.patientId,
        appointmentId: appointment._id,
        ...(appointment.doctorId ? { assignedDoctorId: appointment.doctorId } : {}),
        complaint: appointment.reason,
        notes: appointment.notes,
        status: "triage",
        recordedBy: userId,
      });
      await visit.save();
      appointment.visitId = new Types.ObjectId(String(visit._id));
      appointment.checkedInAt = new Date();
      appointment.status = "checked_in";
      appointment.updatedBy = new Types.ObjectId(userId);
      await appointment.save();
      return { appointment, visit, created: true };
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error;
      const visit = await ClinicVisit.findOne({ appointmentId: appointment._id });
      if (!visit) throw error;
      appointment.visitId = new Types.ObjectId(String(visit._id));
      appointment.checkedInAt ??= new Date();
      appointment.status = "checked_in";
      appointment.updatedBy = new Types.ObjectId(userId);
      await appointment.save();
      return { appointment, visit, created: false };
    }
  }

  private async assertNoDoctorConflict(
    doctorId: IAppointment["doctorId"] | undefined,
    appointmentDate: Date | undefined,
    durationMinutes = 30,
    excludeId?: string,
    status = "pending",
    session?: ClientSession,
  ): Promise<void> {
    if (!doctorId || !appointmentDate || status === "cancelled") return;
    const start = new Date(appointmentDate);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const windowStart = new Date(start.getTime() - 8 * 60 * 60_000);
    const windowEnd = new Date(end.getTime() + 8 * 60 * 60_000);
    const appointments = await Appointment.find({
      doctorId,
      appointmentDate: { $gte: windowStart, $lte: windowEnd },
      status: { $ne: "cancelled" },
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).session(session ?? null);
    const conflicts = appointments.some((item) => {
      const itemStart = new Date(item.appointmentDate);
      const itemEnd = new Date(itemStart.getTime() + (item.durationMinutes ?? 30) * 60_000);
      return start < itemEnd && itemStart < end;
    });
    if (conflicts) throw new AppError("Doctor already has an overlapping appointment", 409);
  }
}
