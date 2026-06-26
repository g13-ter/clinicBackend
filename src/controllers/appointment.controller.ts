import { Request, Response, NextFunction } from "express";
import { AppointmentService } from "../services/appointment.service";

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

    res.status(201).json({ message: "Appointment created successfully", appointment });
  } catch (error) {
    next(error);
  }
};

// GET ALL
export const getAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const appointments = await appointmentService.getAppointments();
    res.status(200).json(appointments);
  } catch (error) {
    next(error);
  }
};

// GET BY ID
export const getAppointmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const appointment = await appointmentService.getAppointmentById(id);
    res.status(200).json(appointment);
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const appointment = await appointmentService.updateAppointment(id, req.body);
    res.status(200).json({ message: "Appointment updated successfully", appointment });
  } catch (error) {
    next(error);
  }
};
