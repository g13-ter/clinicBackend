import { Request, Response, NextFunction } from "express";
import { PatientService } from "../services/patient.service";

const patientService = new PatientService();

// CREATE
export const createPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patient = await patientService.createPatient(req.body);
    res.status(201).json(patient);
  } catch (error) {
    next(error);
  }
};

// GET ALL (doctor/nurse)
export const getPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const patients = await patientService.getPatients(includeInactive);
    res.status(200).json(patients);
  } catch (error) {
    next(error);
  }
};

// GET BASIC LIST (staff)
export const getPatientsBasic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patients = await patientService.getPatientsBasic();
    res.status(200).json(patients);
  } catch (error) {
    next(error);
  }
};

// GET BY ID
export const getPatientById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const patient = await patientService.getPatientById(id);
    res.status(200).json(patient);
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updatePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const patient = await patientService.updatePatient(id, req.body);
    res.status(200).json(patient);
  } catch (error) {
    next(error);
  }
};

// ARCHIVE (soft delete)
export const archivePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const patient = await patientService.archivePatient(id);
    res.status(200).json({ message: "Patient archived successfully", patient });
  } catch (error) {
    next(error);
  }
};
