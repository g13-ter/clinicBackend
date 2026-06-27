import { Request, Response, NextFunction } from "express";
import { PatientService } from "../services/patient.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";

const patientService = new PatientService();

// CREATE
export const createPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const createdBy = (req as any).user.id;
    const patient = await patientService.createPatient({ ...req.body, createdBy });
    res.status(201).json({ success: true, message: "Patient created successfully", data: patient });
  } catch (error) {
    next(error);
  }
};

// GET ALL (doctor/nurse)
export const getPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const search = req.query.search as string | undefined;
    const pagination = getPaginationParams(req.query);

    const { patients, total } = await patientService.getPatients(includeInactive, pagination, search);

    res.status(200).json({
      success: true,
      message: "Patients retrieved successfully",
      data: patients,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};

// GET BASIC LIST (staff)
export const getPatientsBasic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patients = await patientService.getPatientsBasic();
    res.status(200).json({ success: true, message: "Patients retrieved successfully", data: patients });
  } catch (error) {
    next(error);
  }
};

// GET BY ID
export const getPatientById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const patient = await patientService.getPatientById(id);
    res.status(200).json({ success: true, message: "Patient retrieved successfully", data: patient });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updatePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const updatedBy = (req as any).user.id;
    const patient = await patientService.updatePatient(id, { ...req.body, updatedBy });
    res.status(200).json({ success: true, message: "Patient updated successfully", data: patient });
  } catch (error) {
    next(error);
  }
};

// ARCHIVE (soft delete)
export const archivePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const updatedBy = (req as any).user.id;
    const patient = await patientService.archivePatient(id, updatedBy);
    res.status(200).json({ success: true, message: "Patient archived successfully", data: patient });
  } catch (error) {
    next(error);
  }
};