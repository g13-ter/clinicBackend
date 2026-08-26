import { Request, Response, NextFunction } from "express";
import { PatientService } from "../services/patient.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import type { IPatient } from "../models/patient.model";
import { AppError } from "../middleware/error.middleware";

const patientService = new PatientService();

const ageFromDateOfBirth = (value: unknown): number | undefined => {
  if (!value) return undefined;
  const birthDate = new Date(value as string | number | Date);
  if (Number.isNaN(birthDate.getTime())) return undefined;
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayPending =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate());
  if (birthdayPending) age -= 1;
  if (age < 1 || age > 100) {
    throw new AppError("Date of birth must produce an age between 1 and 100", 400);
  }
  return age;
};

const withCalculatedAge = (body: Record<string, unknown>): Record<string, unknown> => {
  const age = ageFromDateOfBirth(body.dateOfBirth);
  return age === undefined ? body : { ...body, age };
};

const STAFF_PATIENT_FIELDS = [
  "patientType",
  "educationLevel",
  "studentId",
  "employeeId",
  "firstName",
  "lastName",
  "age",
  "gender",
  "course",
  "yearLevel",
  "programDurationYears",
  "department",
  "position",
  "contactNumber",
  "email",
  "address",
  "dateOfBirth",
  "guardianName",
  "guardianContactNumber",
  "emergencyContactName",
  "emergencyContactNumber",
] as const;

const staffPatientPayload = (body: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    STAFF_PATIENT_FIELDS
      .filter((field) => body[field] !== undefined)
      .map((field) => [field, body[field]]),
  );

const toDemographicPatient = (patient: IPatient) => {
  const source = patient.toObject();
  const {
    _id, patientType, educationLevel, studentId, employeeId, firstName, lastName, age, gender, course, yearLevel, programDurationYears, department, position,
    contactNumber, email, address, dateOfBirth, guardianName,
    guardianContactNumber, emergencyContactName, emergencyContactNumber, isActive,
  } = source;
  return { _id, patientType, educationLevel, studentId, employeeId, firstName, lastName, age, gender, course, yearLevel, programDurationYears, department, position, contactNumber, email, address, dateOfBirth, guardianName, guardianContactNumber, emergencyContactName, emergencyContactNumber, isActive };
};

const toAdminPatient = (patient: IPatient) => {
  const source = patient.toObject();
  const {
    _id, patientType, educationLevel, studentId, employeeId, firstName, lastName, gender, course, yearLevel, programDurationYears, department, position,
    contactNumber, schoolYear, enrollmentStatus, completionReviewDecision, completionReviewNotes, completionReviewedAt, completionReviewedBy, isActive,
  } = source;
  return {
    _id, patientType, educationLevel, studentId, employeeId, firstName, lastName, gender, course, yearLevel, programDurationYears, department, position,
    contactNumber, schoolYear, enrollmentStatus, completionReviewDecision, completionReviewNotes, completionReviewedAt, completionReviewedBy, isActive,
  };
};

const patientForRole = (patient: IPatient, role: string) =>
  role === "admin" || role === "superadmin"
    ? toAdminPatient(patient)
    : role === "staff"
      ? toDemographicPatient(patient)
      : patient;

const completionReviewAuditSnapshot = (patient: IPatient): Record<string, unknown> => ({
  educationLevel: patient.educationLevel,
  yearLevel: patient.yearLevel,
  schoolYear: patient.schoolYear,
  enrollmentStatus: patient.enrollmentStatus,
  isActive: patient.isActive,
  completionReviewDecision: patient.completionReviewDecision,
  completionReviewNotes: patient.completionReviewNotes,
  completionReviewedAt: patient.completionReviewedAt,
  completionReviewedBy: patient.completionReviewedBy,
});

// CREATE
export const createPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authenticatedUser = getAuthenticatedUser(req);
    const userId = authenticatedUser.id;
    const submitted = withCalculatedAge(req.body as Record<string, unknown>);
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

    res.status(201).json({
      success: true,
      message: "Patient created successfully",
      data: patientForRole(patient, authenticatedUser.role),
    });
  } catch (error) {
    next(error);
  }
};

// GET ALL — read-only, not audit-logged
export const getPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const search = req.query.search as string | undefined;
    const requestedType = req.query.patientType as string | undefined;
    const patientType = ["student", "teacher", "staff"].includes(requestedType ?? "")
      ? requestedType as "student" | "teacher" | "staff"
      : undefined;
    const sortOrder = req.query.sortOrder === "oldest" ? "oldest" : "newest";
    const pagination = getPaginationParams(req.query);

    const { patients, total } = await patientService.getPatients(
      includeInactive,
      pagination,
      search,
      patientType,
      sortOrder,
    );

    const role = getAuthenticatedUser(req).role;
    res.status(200).json({
      success: true,
      message: "Patients retrieved successfully",
      data: role === "admin"
        ? patients.map(toAdminPatient)
        : role === "staff"
          ? patients.map(toDemographicPatient)
          : patients,
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
    const requestedType = req.query.patientType as string | undefined;
    const patientType = ["student", "teacher", "staff"].includes(requestedType ?? "") ? requestedType as "student" | "teacher" | "staff" : undefined;
    const patients = await patientService.getPatientsBasic(search, patientType);
    res.status(200).json({ success: true, message: "Patients retrieved successfully", data: patients });
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
    res.status(200).json({ success: true, message: "Patient retrieved successfully", data: isStaff ? toDemographicPatient(patient) : patient });
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
    const submitted = withCalculatedAge(req.body as Record<string, unknown>);
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

    res.status(200).json({
      success: true,
      message: "Patient updated successfully",
      data: patientForRole(after, authenticatedUser.role),
    });
  } catch (error) {
    next(error);
  }
};

export const updateClinicalProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const { before, after } = await patientService.updateClinicalProfile(
      id,
      req.body,
      getAuthenticatedObjectId(req),
      actor.role,
    );

    logAudit({
      action: "update",
      resource: "PatientClinicalProfile",
      resourceId: id,
      performedBy: actor.id,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({
      success: true,
      message: actor.role === "doctor"
        ? "Clinical profile updated and verified"
        : after.clinicalProfileVerifiedAt
          ? "Clinical profile saved; existing doctor verification remains current"
          : "Clinical profile saved for doctor review",
      data: after,
    });
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

    res.status(200).json({
      success: true,
      message: "Patient archived successfully",
      data: { _id: after._id, studentId: after.studentId, isActive: after.isActive },
    });
  } catch (error) {
    next(error);
  }
};

export const advanceStudentSchoolYear = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const result = await patientService.advanceSchoolYear(
      req.body.schoolYear,
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
      message: `${result.promoted} students promoted and ${result.pendingReview} students marked for completion review`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const reviewStudentCompletion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const { before, after } = await patientService.reviewStudentCompletion(
      id,
      req.body.decision,
      req.body.notes,
      getAuthenticatedObjectId(req),
    );

    await logAudit({
      action: "update",
      resource: "StudentCompletionReview",
      resourceId: id,
      performedBy: actor.id,
      before: completionReviewAuditSnapshot(before),
      after: completionReviewAuditSnapshot(after),
      method: req.method,
      path: req.originalUrl,
    });

    const decisionLabel: Record<string, string> = {
      graduated: "Graduated",
      retained: "Retained",
      extended: "Extended / Continuing",
      transferred: "Transferred",
    };
    res.status(200).json({
      success: true,
      message: `Student marked as ${decisionLabel[req.body.decision] ?? req.body.decision}`,
      data: toAdminPatient(after),
    });
  } catch (error) {
    next(error);
  }
};
