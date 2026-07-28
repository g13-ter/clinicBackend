import { Request, Response, NextFunction } from "express";
import { AppointmentService } from "../services/appointment.service";
import { PatientService } from "../services/patient.service";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { enqueueNotification } from "../services/notificationOutbox.service";
import logger from "../utils/logger";

const appointmentService = new AppointmentService();
const patientService = new PatientService();
const userService = new UserService();

// CREATE
export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthenticatedUser(req).id;
    const actor = getAuthenticatedUser(req);
    const { patientId, doctorId, appointmentDate, reason, notes, durationMinutes, type, sourceVisitId } = req.body;
    const assignedDoctorId = actor.role === "doctor" ? actor.id : doctorId;

    const appointment = await appointmentService.createAppointment({
      patientId,
      doctorId: assignedDoctorId,
      appointmentDate,
      reason,
      notes,
      durationMinutes,
      type,
      sourceVisitId,
      createdBy: getAuthenticatedObjectId(req),
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

    res.status(201).json({ success: true, message: "Appointment created successfully", data: appointment });

    // Email failures must not affect the completed request.
    (async () => {
      try {
        const patient = await patientService.getPatientById(patientId);
        if (!patient.email) return;

        let doctorName: string | undefined;
        if (assignedDoctorId) {
          const doctor = await userService.getUserById(assignedDoctorId);
          doctorName = doctor.name;
        }

        await enqueueNotification({
          kind: "appointment_confirmation",
          recipient: patient.email,
          dedupeKey: `appointment-confirmation:${appointment._id}:${patient.email}`,
          payload: {
            patientName: `${patient.firstName} ${patient.lastName}`,
            appointmentDate: appointment.appointmentDate.toISOString(),
            reason: appointment.reason,
            ...(doctorName ? { doctorName } : {}),
          },
        });
      } catch (emailError) {
        logger.error("Failed to send appointment confirmation email:", emailError);
      }
    })();
  } catch (error) {
    next(error);
  }
};

// GET ALL — read-only, not audit-logged
export const getAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const search = req.query.search as string | undefined;
    const date = req.query.date as string | undefined;
    const doctorId = req.query.doctorId as string | undefined;
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
    const userId = getAuthenticatedUser(req).id;
    const { before, after } = await appointmentService.updateAppointment(id, {
      ...req.body,
      updatedBy: getAuthenticatedObjectId(req),
    });

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

    res.status(200).json({ success: true, message: "Appointment updated successfully", data: after });
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
