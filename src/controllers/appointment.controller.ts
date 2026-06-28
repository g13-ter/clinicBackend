import { Request, Response, NextFunction } from "express";
import { AppointmentService } from "../services/appointment.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";

const appointmentService = new AppointmentService();

// CREATE
export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { patientId, appointmentDate, reason, notes } = req.body;

    const appointment = await appointmentService.createAppointment({
      patientId,
      appointmentDate,
      reason,
      notes,
      createdBy: userId,
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

// GET ALL
export const getAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const search = req.query.search as string | undefined;
    const pagination = getPaginationParams(req.query);

    const { appointments, total } = await appointmentService.getAppointments(pagination, search);

    logAudit({
      action: "view",
      resource: "Appointment",
      resourceId: "list",
      performedBy: userId,
      after: { viewedIds: appointments.map((a: any) => String(a._id)), page: pagination.page },
      method: req.method,
      path: req.originalUrl,
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

// GET BY ID
export const getAppointmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const id = req.params.id as string;
    const appointment = await appointmentService.getAppointmentById(id);

    logAudit({
      action: "view",
      resource: "Appointment",
      resourceId: id,
      performedBy: userId,
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Appointment retrieved successfully", data: appointment });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;
    const { before, after } = await appointmentService.updateAppointment(id, { ...req.body, updatedBy: userId });

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