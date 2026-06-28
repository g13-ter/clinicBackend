import { Request, Response, NextFunction } from "express";
import { PatientService } from "../services/patient.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";

const patientService = new PatientService();

// CREATE
export const createPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const patient = await patientService.createPatient({ ...req.body, createdBy: userId });

    logAudit({
      action: "create",
      resource: "Patient",
      resourceId: String(patient._id),
      performedBy: userId,
      after: patient.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(201).json({ success: true, message: "Patient created successfully", data: patient });
  } catch (error) {
    next(error);
  }
};

// GET ALL (doctor/nurse)
export const getPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const includeInactive = req.query.includeInactive === "true";
    const search = req.query.search as string | undefined;
    const pagination = getPaginationParams(req.query);

    const { patients, total } = await patientService.getPatients(includeInactive, pagination, search);

    logAudit({
      action: "view",
      resource: "Patient",
      resourceId: "list",
      performedBy: userId,
      after: { viewedIds: patients.map((p: any) => String(p._id)), page: pagination.page },
      method: req.method,
      path: req.originalUrl,
    });

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
// NOTE: not audit-logged - this is a lightweight dropdown/lookup list,
// hit far more often than a real "view" of patient data, and contains
// no sensitive info (just name/ID/course). Logging every call here would
// add a lot of low-value volume to the audit trail.
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
    const userId = (req as any).user.id;
    const id = req.params.id as string;
    const patient = await patientService.getPatientById(id);

    logAudit({
      action: "view",
      resource: "Patient",
      resourceId: id,
      performedBy: userId,
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Patient retrieved successfully", data: patient });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updatePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;
    const { before, after } = await patientService.updatePatient(id, { ...req.body, updatedBy: userId });

    logAudit({
      action: "update",
      resource: "Patient",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Patient updated successfully", data: after });
  } catch (error) {
    next(error);
  }
};

// ARCHIVE (soft delete)
export const archivePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;
    const { before, after } = await patientService.archivePatient(id, userId);

    logAudit({
      action: "delete",
      resource: "Patient",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Patient archived successfully", data: after });
  } catch (error) {
    next(error);
  }
};