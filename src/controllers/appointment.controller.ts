import { Request, Response, NextFunction } from "express";
import Appointment from "../models/appointment.model";
import { AppError } from "../middleware/error.middleware";


// CREATE APPOINTMENT
export const createAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const {
      patientId,
      appointmentDate,
      reason,
      notes
    } = req.body;


    const createdBy = (req as any).user.id;


    const appointment = await Appointment.create({
      patientId,
      appointmentDate,
      reason,
      notes,
      createdBy
    });


    res.status(201).json({
      message: "Appointment created successfully",
      appointment
    });

  } catch (error) {

    next(error);

  }

};


// GET ALL APPOINTMENTS
export const getAppointments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const appointments = await Appointment.find()
      .populate("patientId", "studentId firstName lastName")
      .populate("createdBy", "name role")
      .sort({
        appointmentDate: 1
      });


    res.status(200).json(appointments);

  } catch (error) {

    next(error);

  }

};


// GET SINGLE APPOINTMENT
export const getAppointmentById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const appointment = await Appointment.findById(
      req.params.id
    )
      .populate("patientId", "studentId firstName lastName")
      .populate("createdBy", "name role");


    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }


    res.status(200).json(appointment);

  } catch (error) {

    next(error);

  }

};


// UPDATE APPOINTMENT
export const updateAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }


    res.status(200).json({
      message: "Appointment updated successfully",
      appointment
    });

  } catch (error) {

    next(error);

  }

};