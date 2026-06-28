import { Request, Response, NextFunction } from "express";
import { ClinicVisitService } from "../services/clinicVisit.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";

const clinicVisitService = new ClinicVisitService();

// CREATE
export const createVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { patientId, complaint, treatment, notes, bloodPressure, temperature, pulseRate } = req.body;

    const visit = await clinicVisitService.createVisit({
      patientId,
      complaint,
      treatment,
      notes,
      bloodPressure,
      temperature,
      pulseRate,
      recordedBy: userId,
    });

    logAudit({
      action: "create",
      resource: "ClinicVisit",
      resourceId: String(visit._id),
      performedBy: userId,
      after: visit.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(201).json({ success: true, message: "Clinic visit created successfully", data: visit });
  } catch (error) {
    next(error);
  }
};

// GET ALL BY PATIENT
export const getVisitsByPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const patientId = req.params.patientId as string;
    const search = req.query.search as string | undefined;
    const pagination = getPaginationParams(req.query);

    const { visits, total } = await clinicVisitService.getVisitsByPatient(patientId, pagination, search);

    logAudit({
      action: "view",
      resource: "ClinicVisit",
      resourceId: `patient:${patientId}`,
      performedBy: userId,
      after: { viewedIds: visits.map((v: any) => String(v._id)), page: pagination.page },
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({
      success: true,
      message: "Clinic visits retrieved successfully",
      data: visits,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};

// GET BY ID
export const getVisitById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const id = req.params.id as string;
    const visit = await clinicVisitService.getVisitById(id);

    logAudit({
      action: "view",
      resource: "ClinicVisit",
      resourceId: id,
      performedBy: userId,
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Clinic visit retrieved successfully", data: visit });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;
    const { before, after } = await clinicVisitService.updateVisit(id, { ...req.body, updatedBy: userId });

    logAudit({
      action: "update",
      resource: "ClinicVisit",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Clinic visit updated successfully", data: after });
  } catch (error) {
    next(error);
  }
};

// ARCHIVE (soft delete)
export const archiveVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;
    const { before, after } = await clinicVisitService.archiveVisit(id, userId);

    logAudit({
      action: "delete",
      resource: "ClinicVisit",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Clinic visit archived successfully", data: after });
  } catch (error) {
    next(error);
  }
};