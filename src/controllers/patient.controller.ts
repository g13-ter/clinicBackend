import { Request, Response, NextFunction } from "express";
import { PatientService } from "../services/patient.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import type { IPatient } from "../models/patient.model";

const patientService = new PatientService();

const STAFF_PATIENT_FIELDS = [
  "studentId",
  "firstName",
  "lastName",
  "age",
  "gender",
  "course",
  "yearLevel",
  "contactNumber",
  "email",
  "address",
  "dateOfBirth",
  "guardianName",
  "guardianContactNumber",
] as const;

const staffPatientPayload = (body: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    STAFF_PATIENT_FIELDS
      .filter((field) => body[field] !== undefined)
      .map((field) => [field, body[field]]),
  );

const toStaffPatient = (patient: IPatient) => {
  const source = patient.toObject();
  const {
    _id, studentId, firstName, lastName, age, gender, course, yearLevel,
    contactNumber, email, address, dateOfBirth, guardianName,
    guardianContactNumber, isActive,
  } = source;
  return { _id, studentId, firstName, lastName, age, gender, course, yearLevel, contactNumber, email, address, dateOfBirth, guardianName, guardianContactNumber, isActive };
};

// CREATE
export const createPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authenticatedUser = getAuthenticatedUser(req);
    const userId = authenticatedUser.id;
    const submitted = req.body as Record<string, unknown>;
    const patient = await patientService.createPatient({
      ...(authenticatedUser.role === "staff" ? staffPatientPayload(submitted) : submitted),
      createdBy: getAuthenticatedObjectId(req),
    });

    logAudit({
      action: "create",
      resource: "Patient",
      resourceId: String(patient._id),
      performedBy: userId,
      after: patient.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(201).json({ success: true, message: "Student created successfully", data: patient });
  } catch (error) {
    next(error);
  }
};

// GET ALL — read-only, not audit-logged
export const getPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const search = req.query.search as string | undefined;
    const pagination = getPaginationParams(req.query);

    const { patients, total } = await patientService.getPatients(includeInactive, pagination, search);

    const isStaff = getAuthenticatedUser(req).role === "staff";
    res.status(200).json({
      success: true,
      message: "Students retrieved successfully",
      data: isStaff ? patients.map(toStaffPatient) : patients,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};

// GET BASIC LIST — non-sensitive lookup, not audit-logged
export const getPatientsBasic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const search = req.query.search as string | undefined;
    const patients = await patientService.getPatientsBasic(search);
    res.status(200).json({ success: true, message: "Students retrieved successfully", data: patients });
  } catch (error) {
    next(error);
  }
};

// GET BY ID — read-only, not audit-logged
export const getPatientById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const patient = await patientService.getPatientById(id);

    const isStaff = getAuthenticatedUser(req).role === "staff";
    res.status(200).json({ success: true, message: "Student retrieved successfully", data: isStaff ? toStaffPatient(patient) : patient });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updatePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const authenticatedUser = getAuthenticatedUser(req);
    const userId = authenticatedUser.id;
    const submitted = req.body as Record<string, unknown>;
    const { before, after } = await patientService.updatePatient(id, {
      ...(authenticatedUser.role === "staff" ? staffPatientPayload(submitted) : submitted),
      updatedBy: getAuthenticatedObjectId(req),
    });

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

    res.status(200).json({ success: true, message: "Student updated successfully", data: after });
  } catch (error) {
    next(error);
  }
};

// ARCHIVE (soft delete)
export const archivePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;
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

    res.status(200).json({ success: true, message: "Student archived successfully", data: after });
  } catch (error) {
    next(error);
  }
};

export const advanceStudentSchoolYear = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const result = await patientService.advanceSchoolYear(
      req.body.schoolYear,
      req.body.graduatingYearLevel,
      getAuthenticatedObjectId(req),
    );
    await logAudit({
      action: "update",
      resource: "StudentSchoolYear",
      resourceId: req.body.schoolYear,
      performedBy: user.id,
      after: result,
      method: req.method,
      path: req.originalUrl,
    });
    res.status(200).json({
      success: true,
      message: `${result.promoted} students promoted and ${result.graduated} students graduated`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
