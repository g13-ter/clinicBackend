import { Request, Response, NextFunction } from "express";
import { AppointmentService } from "../services/appointment.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";

const appointmentService = new AppointmentService();

// CREATE
export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthenticatedUser(req).id;
    const { patientId, appointmentDate, reason, notes } = req.body;

    const appointment = await appointmentService.createAppointment({
      patientId,
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