import { Request, Response, NextFunction } from "express";
import { MedicalHistoryService } from "../services/medicalHistory.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";

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

    res.status(201).json({ success: true, message: "Medical history entry created successfully", data: entry });
  } catch (error) {
    next(error);
  }
};

// GET ALL BY PATIENT
export const getHistoryByPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.params.patientId as string;
    const pagination = getPaginationParams(req.query);

    const { history, total } = await medicalHistoryService.getHistoryByPatient(patientId, pagination);

    res.status(200).json({
      success: true,
      message: "Medical history retrieved successfully",
      data: history,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};

// GET BY ID
export const getHistoryById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const entry = await medicalHistoryService.getHistoryById(id);
    res.status(200).json({ success: true, message: "Medical history entry retrieved successfully", data: entry });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const updatedBy = (req as any).user.id;
    const entry = await medicalHistoryService.updateMedicalHistory(id, { ...req.body, updatedBy });
    res.status(200).json({ success: true, message: "Medical history entry updated successfully", data: entry });
  } catch (error) {
    next(error);
  }
};