import { Request, Response, NextFunction } from "express";
import { MedicalHistoryService } from "../services/medicalHistory.service";

const medicalHistoryService = new MedicalHistoryService();

// CREATE
export const createMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientId, diagnosis, prescription, familyHistory, allergies } = req.body;
    const recordedBy = (req as any).user.id;

    const entry = await medicalHistoryService.createMedicalHistory({
      patientId,
      diagnosis,
      prescription,
      familyHistory,
      allergies,
      recordedBy,
    });

    res.status(201).json({ message: "Medical history entry created successfully", entry });
  } catch (error) {
    next(error);
  }
};

// GET ALL BY PATIENT
export const getHistoryByPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.params.patientId as string; // ✅ cast to string
    const history = await medicalHistoryService.getHistoryByPatient(patientId);
    res.status(200).json(history);
  } catch (error) {
    next(error);
  }
};

// GET BY ID
export const getHistoryById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const entry = await medicalHistoryService.getHistoryById(id);
    res.status(200).json(entry);
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const entry = await medicalHistoryService.updateMedicalHistory(id, req.body);
    res.status(200).json({ message: "Medical history entry updated successfully", entry });
  } catch (error) {
    next(error);
  }
};
