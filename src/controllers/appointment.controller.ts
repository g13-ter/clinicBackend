import { Request, Response, NextFunction } from "express";
import { AppointmentService } from "../services/appointment.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";

const appointmentService = new AppointmentService();

// CREATE
export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientId, appointmentDate, reason, notes } = req.body;
    const createdBy = (req as any).user.id;

    const appointment = await appointmentService.createAppointment({
      patientId,
      appointmentDate,
      reason,
      notes,
      createdBy,
    });

    res.status(201).json({ success: true, message: "Appointment created successfully", data: appointment });
  } catch (error) {
    next(error);
  }
};

// GET ALL
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

// GET BY ID
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
    const updatedBy = (req as any).user.id;
    const appointment = await appointmentService.updateAppointment(id, { ...req.body, updatedBy });
    res.status(200).json({ success: true, message: "Appointment updated successfully", data: appointment });
  } catch (error) {
    next(error);
  }
};