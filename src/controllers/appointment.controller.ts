import { Request, Response, NextFunction } from "express";
import { AppointmentService } from "../services/appointment.service";
import { PatientService } from "../services/patient.service";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { enqueueNotification } from "../services/notificationOutbox.service";
import { AppError } from "../middleware/error.middleware";
import type { IAppointment } from "../models/appointment.model";
import type { ClientSession } from "mongoose";
import { withMongoTransaction } from "../utils/transaction";

const appointmentService = new AppointmentService();
const patientService = new PatientService();
const userService = new UserService();

type AppointmentLifecycleKind =
  | "appointment_confirmation"
  | "appointment_doctor_confirmed"
  | "appointment_rescheduled"
  | "appointment_cancelled";

const enqueueAppointmentLifecycleNotification = async (
  kind: AppointmentLifecycleKind,
  appointment: IAppointment,
  previousDate?: Date,
  session?: ClientSession,
): Promise<void> => {
  const patient = await patientService.getPatientById(String(appointment.patientId));
  if (!patient.email) return;

  let doctorName: string | undefined;
  if (appointment.doctorId) {
    const doctor = await userService.getUserById(String(appointment.doctorId));
    doctorName = doctor.name;
  }

  const appointmentDate = appointment.appointmentDate.toISOString();
  await enqueueNotification({
    kind,
    recipient: patient.email,
    dedupeKey: [
      kind,
      String(appointment._id),
      appointment.updatedAt.toISOString(),
      patient.email,
    ].join(":"),
    payload: {
      appointmentId: String(appointment._id),
      patientName: `${patient.firstName} ${patient.lastName}`,
      appointmentDate,
      reason: appointment.reason,
      ...(appointment.cancellationReason
        ? { cancellationReason: appointment.cancellationReason }
        : {}),
      ...(doctorName ? { doctorName } : {}),
      ...(previousDate ? { previousDate: previousDate.toISOString() } : {}),
    },
    ...(session ? { session } : {}),
  });
};

// CREATE
export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthenticatedUser(req).id;
    const actor = getAuthenticatedUser(req);
    const { patientId, doctorId, appointmentDate, reason, notes, durationMinutes, type, sourceVisitId } = req.body;
    const patient = await patientService.getPatientById(patientId);
    if (!patient.isActive) {
      throw new AppError("Appointments can only be scheduled for active students", 409);
    }
    if (actor.role === "staff" && doctorId) {
      throw new AppError("Only a nurse can assign a doctor to an appointment", 403);
    }
    const assignedDoctorId = actor.role === "doctor" ? actor.id : doctorId;
    if (actor.role === "nurse" && !assignedDoctorId) {
      throw new AppError("Please select a doctor for the appointment", 400);
    }
    let assignedDoctorName: string | undefined;
    if (assignedDoctorId) {
      const assignedDoctor = await userService.getUserById(assignedDoctorId);
      if (assignedDoctor.role !== "doctor") {
        throw new AppError("The selected user is not a doctor", 400);
      }
      if (actor.role !== "doctor" && assignedDoctor.isAvailable === false) {
        throw new AppError("The selected doctor is currently unavailable", 409);
      }
      assignedDoctorName = assignedDoctor.name;
    }

    const appointment = await withMongoTransaction(async (session) => {
      const created = await appointmentService.createAppointment({
        patientId,
        ...(assignedDoctorId ? { doctorId: assignedDoctorId } : {}),
        status: assignedDoctorId ? "pending" : "unassigned",
        appointmentDate,
        reason,
        notes,
        durationMinutes,
        type,
        sourceVisitId,
        createdBy: getAuthenticatedObjectId(req),
      }, session);
      await enqueueAppointmentLifecycleNotification(
        "appointment_confirmation",
        created,
        undefined,
        session,
      );
      return created;
    });

    logAudit({
      action: "create",
      resource: "Appointment",
      resourceId: String(appointment._id),
      performedBy: userId,
      after: appointment.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(201).json({
      success: true,
      message: actor.role === "staff"
        ? "Appointment request saved for nurse assignment"
        : actor.role === "doctor"
        ? "Appointment scheduled successfully"
        : `Appointment sent to ${assignedDoctorName} for confirmation`,
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

// GET ALL — read-only, not audit-logged
export const getAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const search = req.query.search as string | undefined;
    const date = req.query.date as string | undefined;
    const actor = getAuthenticatedUser(req);
    const requestedDoctorId = req.query.doctorId as string | undefined;
    // Doctors receive only appointments assigned to their own account.
    const doctorId = actor.role === "doctor" ? actor.id : requestedDoctorId;
    const unassignedOnly = req.query.unassignedOnly === "true";
    const pagination = getPaginationParams(req.query);

    const { appointments, total } = await appointmentService.getAppointments(pagination, search, {
      date,
      doctorId,
      unassignedOnly,
    });

    res.status(200).json({
      success: true,
      message: "Appointments retrieved successfully",
      data: appointments,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};

// GET BY ID — read-only, not audit-logged
export const getAppointmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const appointment = await appointmentService.getAppointmentById(id);

    res.status(200).json({ success: true, message: "Appointment retrieved successfully", data: appointment });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const userId = actor.id;
    if (actor.role !== "nurse" && req.body.doctorId) {
      throw new AppError("Only a nurse can assign or reassign a doctor", 403);
    }
    if (req.body.doctorId) {
      const assignedDoctor = await userService.getUserById(req.body.doctorId);
      if (assignedDoctor.role !== "doctor") {
        throw new AppError("The selected user is not a doctor", 400);
      }
      if (assignedDoctor.isAvailable === false) {
        throw new AppError("The selected doctor is currently unavailable", 409);
      }
    }
    const { before, after } = await withMongoTransaction(async (session) => {
      const result = await appointmentService.updateAppointment(id, {
        ...req.body,
        updatedBy: getAuthenticatedObjectId(req),
      }, session);
      const cancelled =
        result.before.status !== "cancelled" && result.after.status === "cancelled";
      const changed =
        result.before.appointmentDate.getTime() !== result.after.appointmentDate.getTime() ||
        String(result.before.doctorId ?? "") !== String(result.after.doctorId ?? "");
      if (cancelled) {
        await enqueueAppointmentLifecycleNotification(
          "appointment_cancelled",
          result.after,
          undefined,
          session,
        );
      } else if (changed) {
        await enqueueAppointmentLifecycleNotification(
          "appointment_rescheduled",
          result.after,
          result.before.appointmentDate,
          session,
        );
      }
      return result;
    });
    const wasCancelled =
      before.status !== "cancelled" && after.status === "cancelled";
    const scheduleChanged =
      before.appointmentDate.getTime() !== after.appointmentDate.getTime() ||
      String(before.doctorId ?? "") !== String(after.doctorId ?? "");

    logAudit({
      action: "update",
      resource: "Appointment",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({
      success: true,
      message: wasCancelled
        ? "Appointment cancelled successfully"
        : scheduleChanged
          ? "Appointment rescheduled successfully"
          : "Appointment updated successfully",
      data: after,
    });
  } catch (error) {
    next(error);
  }
};

export const completeAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const { before, after } = await appointmentService.completeAppointment(id, actor.id, actor.role);

    logAudit({
      action: "update",
      resource: "Appointment",
      resourceId: id,
      performedBy: actor.id,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Appointment completed successfully", data: after });
  } catch (error) {
    next(error);
  }
};

export const confirmAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const { before, after } = await withMongoTransaction(async (session) => {
      const result = await appointmentService.confirmAppointment(id, actor.id, session);
      await enqueueAppointmentLifecycleNotification(
        "appointment_doctor_confirmed",
        result.after,
        undefined,
        session,
      );
      return result;
    });

    logAudit({
      action: "update",
      resource: "Appointment",
      resourceId: id,
      performedBy: actor.id,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({
      success: true,
      message: "Appointment confirmed. It is ready for check-in.",
      data: after,
    });
  } catch (error) {
    next(error);
  }
};

export const declineAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const { before, after } = await appointmentService.declineAppointment(
      id,
      actor.id,
      req.body.reason,
    );

    logAudit({
      action: "update",
      resource: "Appointment",
      resourceId: id,
      performedBy: actor.id,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({
      success: true,
      message: "Appointment returned to the nurse for reassignment",
      data: after,
    });
  } catch (error) {
    next(error);
  }
};

export const checkInAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const result = await appointmentService.checkInAppointment(id, actor.id, actor.role);

    logAudit({
      action: "update",
      resource: "Appointment",
      resourceId: id,
      performedBy: actor.id,
      after: result.appointment.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.created ? "Student checked in successfully" : "Student is already checked in",
      data: { appointment: result.appointment, visit: result.visit },
    });
  } catch (error) {
    next(error);
  }
};
