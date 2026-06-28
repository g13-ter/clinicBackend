import { Request, Response, NextFunction } from "express";
import { MedicalHistoryService } from "../services/medicalHistory.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";

const medicalHistoryService = new MedicalHistoryService();

// CREATE
export const createMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { patientId, diagnosis, prescription, familyHistory, allergies } = req.body;

    const entry = await medicalHistoryService.createMedicalHistory({
      patientId,
      diagnosis,
      prescription,
      familyHistory,
      allergies,
      recordedBy: userId,
    });

    logAudit({
      action: "create",
      resource: "MedicalHistory",
      resourceId: String(entry._id),
      performedBy: userId,
      after: entry.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(201).json({ success: true, message: "Medical history entry created successfully", data: entry });
  } catch (error) {
    next(error);
  }
};

// GET ALL BY PATIENT
export const getHistoryByPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const patientId = req.params.patientId as string;
    const pagination = getPaginationParams(req.query);

    const { history, total } = await medicalHistoryService.getHistoryByPatient(patientId, pagination);

    logAudit({
      action: "view",
      resource: "MedicalHistory",
      resourceId: `patient:${patientId}`,
      performedBy: userId,
      after: { viewedIds: history.map((h: any) => String(h._id)), page: pagination.page },
      method: req.method,
      path: req.originalUrl,
    });

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
    const userId = (req as any).user.id;
    const id = req.params.id as string;
    const entry = await medicalHistoryService.getHistoryById(id);

    logAudit({
      action: "view",
      resource: "MedicalHistory",
      resourceId: id,
      performedBy: userId,
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Medical history entry retrieved successfully", data: entry });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;
    const { before, after } = await medicalHistoryService.updateMedicalHistory(id, { ...req.body, updatedBy: userId });

    logAudit({
      action: "update",
      resource: "MedicalHistory",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Medical history entry updated successfully", data: after });
  } catch (error) {
    next(error);
  }
};