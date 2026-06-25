import { Request, Response, NextFunction } from "express";
import Patient from "../models/patient.model";
import { AppError } from "../middleware/error.middleware";


// CREATE PATIENT
export const createPatient = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const patient = await Patient.create(req.body);

    res.status(201).json(patient);

  } catch (error) {

    next(error);

  }

};


// GET ALL PATIENTS (full info - doctor/nurse)
export const getPatients = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    // by default only show active patients
    // pass ?includeInactive=true to see archived ones too
    const filter =
      req.query.includeInactive === "true"
        ? {}
        : { isActive: true };

    const patients = await Patient.find(filter);

    res.status(200).json(patients);

  } catch (error) {

    next(error);

  }

};


// GET PATIENT LIST - BASIC INFO ONLY (for staff)
export const getPatientsBasic = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const patients = await Patient.find(
      { isActive: true }
    ).select(
      "studentId firstName lastName course yearLevel"
    );

    res.status(200).json(patients);

  } catch (error) {

    next(error);

  }

};


// GET PATIENT BY ID
export const getPatientById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const patient = await Patient.findById(
      req.params.id
    );

    if (!patient) {
      throw new AppError("Patient not found", 404);
    }

    res.status(200).json(patient);

  } catch (error) {

    next(error);

  }

};


// UPDATE PATIENT
export const updatePatient = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const patient =
      await Patient.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );

    if (!patient) {
      throw new AppError("Patient not found", 404);
    }

    res.status(200).json(patient);

  } catch (error) {

    next(error);

  }

};


// ARCHIVE PATIENT (soft delete - admin only)
// We never truly delete patient records, just mark them inactive
export const archivePatient = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const patient =
      await Patient.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true }
      );

    if (!patient) {
      throw new AppError("Patient not found", 404);
    }

    res.status(200).json({
      message: "Patient archived successfully",
      patient,
    });

  } catch (error) {

    next(error);

  }

};