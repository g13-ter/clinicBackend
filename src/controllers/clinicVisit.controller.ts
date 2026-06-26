import { Request, Response, NextFunction } from "express";
import { ClinicVisitService } from "../services/clinicVisit.service";

const clinicVisitService = new ClinicVisitService();

// CREATE
export const createVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientId, complaint, treatment, notes, bloodPressure, temperature, pulseRate } = req.body;
    const recordedBy = (req as any).user.id;

    const visit = await clinicVisitService.createVisit({
      patientId,
      complaint,
      treatment,
      notes,
      bloodPressure,
      temperature,
      pulseRate,
      recordedBy,
    });

    res.status(201).json({ message: "Clinic visit created successfully", visit });
  } catch (error) {
    next(error);
  }
};

// GET ALL BY PATIENT
export const getVisitsByPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.params.patientId as string; // ✅ cast to string
    const visits = await clinicVisitService.getVisitsByPatient(patientId);
    res.status(200).json(visits);
  } catch (error) {
    next(error);
  }
};

// GET BY ID
export const getVisitById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const visit = await clinicVisitService.getVisitById(id);
    res.status(200).json(visit);
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const visit = await clinicVisitService.updateVisit(id, req.body);
    res.status(200).json({ message: "Clinic visit updated successfully", visit });
  } catch (error) {
    next(error);
  }
};

// ARCHIVE (soft delete)
export const archiveVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const visit = await clinicVisitService.archiveVisit(id);
    res.status(200).json({ message: "Clinic visit archived successfully", visit });
  } catch (error) {
    next(error);
  }
};
