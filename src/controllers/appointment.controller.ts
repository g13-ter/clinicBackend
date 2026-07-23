import { Request, Response, NextFunction } from "express";
import { AppointmentService } from "../services/appointment.service";
import { PatientService } from "../services/patient.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { mailer } from "../services/mailer.service";
import { sendImmediateReminderIfLateBooking } from "../services/reminder.service";
import logger from "../utils/logger";

const appointmentService = new AppointmentService();
const patientService = new PatientService();

// CREATE
export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthenticatedUser(req).id;
    const { patientId, doctorId, appointmentDate, reason, notes } = req.body;

    const appointment = await appointmentService.createAppointment({
      patientId,
      doctorId,
      appointmentDate,
      reason,
      notes,
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

    // Fire-and-forget: never let an email failure affect the API response,
    // which has already been sent above.
    (async () => {
      try {
        const patient = await patientService.getPatientById(patientId);
        if (!patient.email) return;

        await mailer.sendAppointmentConfirmation({
          to: patient.email,
          patientName: `${patient.firstName} ${patient.lastName}`,
          appointmentDate: appointment.appointmentDate,
          reason: appointment.reason,
        });
      } catch (emailError) {
        logger.error("Failed to send appointment confirmation email:", emailError);
      }

      // If this appointment was booked too close to its date for the
      // hourly reminder sweep to ever catch it, send the reminder now.
      try {
        await sendImmediateReminderIfLateBooking(String(appointment._id));
      } catch (reminderError) {
        logger.error("Failed to send immediate reminder for late-booked appointment:", reminderError);
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
    const pagination = getPaginationParams(req.query);

    const { appointments, total } = await appointmentService.getAppointments(pagination, search);

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