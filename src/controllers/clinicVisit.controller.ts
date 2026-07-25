import { Request, Response, NextFunction } from "express";
import { ClinicVisitService } from "../services/clinicVisit.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";

const clinicVisitService = new ClinicVisitService();

// GET TODAY COUNT
export const getTodayVisitCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = await clinicVisitService.getTodayCount();
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
};

// GET QUEUE — clinic-wide list of currently open visits, not audit-logged
export const getQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const queue = await clinicVisitService.getQueue();
    res.status(200).json({ success: true, message: "Patient queue retrieved successfully", data: queue });
  } catch (error) {
    next(error);
  }
};

// MARK READY FOR DOCTOR — nurse signals triage/vitals are done
export const markReadyForDoctor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;
    const { before, after } = await clinicVisitService.markReadyForDoctor(id, userId);

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

    res.status(200).json({ success: true, message: "Patient marked ready for doctor", data: after });
  } catch (error) {
    next(error);
  }
};

// CREATE
export const createVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthenticatedUser(req).id;
    const { patientId, complaint, treatment, notes, bloodPressure, temperature, pulseRate } = req.body;

    const visit = await clinicVisitService.createVisit({
      patientId,
      complaint,
      treatment,
      notes,
      bloodPressure,
      temperature,
      pulseRate,
      recordedBy: getAuthenticatedObjectId(req),
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

// GET ALL BY PATIENT — read-only, not audit-logged
export const getVisitsByPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.params.patientId as string;
    const search = req.query.search as string | undefined;
    const pagination = getPaginationParams(req.query);

    const { visits, total } = await clinicVisitService.getVisitsByPatient(patientId, pagination, search);

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

// GET BY ID — read-only, not audit-logged
export const getVisitById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const visit = await clinicVisitService.getVisitById(id);

    res.status(200).json({ success: true, message: "Clinic visit retrieved successfully", data: visit });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;
    const { before, after } = await clinicVisitService.updateVisit(id, {
      ...req.body,
      updatedBy: getAuthenticatedObjectId(req),
    });

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
    const userId = getAuthenticatedUser(req).id;
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