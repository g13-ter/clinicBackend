import { Request, Response, NextFunction } from "express";
import { MedicalHistoryService } from "../services/medicalHistory.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import logger, { errorMetadata } from "../utils/logger";
import { AppError } from "../middleware/error.middleware";
import { buildMedicalCertificateDocx } from "../utils/medicalCertificateDocx";
import Patient from "../models/patient.model";
import SystemSettings, { DEFAULT_CLINIC_PROFILE } from "../models/systemSettings.model";
import { notifyActiveNurses } from "../services/inAppNotification.service";

const medicalHistoryService = new MedicalHistoryService();

// CREATE
export const createMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const actor = getAuthenticatedUser(req);
    const userId = actor.id;
    const { patientId, visitId, diagnosis, prescription, remarks, fitnessForWork, prescribedItems, labRequest, familyHistory, allergies, closureOutcome } = req.body;

    if (actor.role === "nurse") {
      if (!Array.isArray(prescribedItems) || prescribedItems.length === 0) {
        throw new AppError("A nurse-created medical history entry must include a medication order", 400);
      }
      if (diagnosis || remarks || fitnessForWork || labRequest || familyHistory || allergies) {
        throw new AppError(
          "Nurse medication orders cannot include physician diagnosis, laboratory, or medical-history fields",
          403,
        );
      }
    }

    const { entry } = await medicalHistoryService.createMedicalHistory({
      patientId,
      visitId,
      diagnosis,
      prescription,
      remarks,
      fitnessForWork,
      prescribedItems,
      labRequest,
      familyHistory,
      allergies,
      recordedBy: getAuthenticatedObjectId(req),
    }, {
      providerRole: actor.role === "nurse" ? "nurse" : "doctor",
      closureOutcome,
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

    if ((entry.prescribedItems?.length ?? 0) > 0) {
      try {
        const patient = await Patient.findById(patientId).select("firstName lastName").lean();
        const studentName = patient
          ? `${patient.firstName} ${patient.lastName}`
          : "Student";
        const medicationSummary = entry.prescribedItems!
          .map((item) => {
            const instructions = item.instructions ? ` — ${item.instructions}` : "";
            return `${item.medicineName} × ${item.quantity} ${item.unit}${instructions}`;
          })
          .join("; ");

        await notifyActiveNurses({
          kind: "medication_order",
          title: `Medication requested by ${actor.role}`,
          message: `${studentName}: ${medicationSummary}`,
          link: `/dashboard?view=medications&order=${entry._id}`,
          resourceType: "MedicalHistory",
          resourceId: String(entry._id),
          dedupeKey: `nurse:medication-order:${entry._id}`,
        });
      } catch (notificationError) {
        logger.error("nurse_medication_notification_failed", {
          medicalHistoryId: String(entry._id),
          ...errorMetadata(notificationError),
        });
      }
    }

    res.status(201).json({
      success: true,
      message: entry.prescribedItems?.length
        ? "Medication order saved and the nurse was notified"
        : "Medical history entry created successfully",
      data: entry,
    });
  } catch (error) {
    next(error);
  }
};

// GET ALL BY PATIENT — read-only, not audit-logged
export const getHistoryByPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.params.patientId as string;
    const pagination = getPaginationParams(req.query);

    const actor = getAuthenticatedUser(req);
    const { history, total } = await medicalHistoryService.getHistoryByPatient(
      patientId,
      pagination,
      actor.role === "doctor" ? actor.id : undefined,
    );

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

// GET BY ID — read-only, not audit-logged
export const getHistoryById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const entry = await medicalHistoryService.getHistoryById(
      id,
      actor.role === "doctor" ? actor.id : undefined,
    );

    res.status(200).json({ success: true, message: "Medical history entry retrieved successfully", data: entry });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;
    const { before, after } = await medicalHistoryService.updateMedicalHistory(id, {
      ...req.body,
      updatedBy: getAuthenticatedObjectId(req),
    }, userId);

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

export const downloadMedicalCertificate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const actor = getAuthenticatedUser(req);
    const entry = await medicalHistoryService.getHistoryById(req.params.id as string, actor.id);
    const patient = entry.patientId as unknown as {
      patientType?: "student" | "teacher" | "staff";
      firstName?: string;
      lastName?: string;
      studentId?: string;
      employeeId?: string;
      age?: number;
      gender?: string;
    };
    const physician = entry.recordedBy as unknown as {
      name?: string;
      role?: string;
      licenseNumber?: string;
      ptrNumber?: string;
    };
    const visit = entry.visitId as unknown as {
      visitDate?: Date;
      complaint?: string;
      closureOutcome?: string;
    } | undefined;

    const isStudent = !patient?.patientType || patient.patientType === "student";
    const patientIdentifier = isStudent ? patient?.studentId : patient?.employeeId || patient?.studentId;
    const patientIdentifierLabel = isStudent
      ? "Student ID"
      : patient?.employeeId ? "Employee ID" : "Patient ID";
    if (!patient?.firstName || !patient?.lastName || !patientIdentifier) {
      throw new AppError("The patient record is incomplete and a certificate cannot be generated", 409);
    }
    if (!physician?.name || physician.role !== "doctor") {
      throw new AppError("A certificate requires a saved physician consultation", 409);
    }
    const studentDisposition = isStudent && ["returned_to_class", "sent_home", "guardian_pickup"].includes(visit?.closureOutcome ?? "")
      ? visit?.closureOutcome as "returned_to_class" | "sent_home" | "guardian_pickup"
      : undefined;
    if (isStudent && !studentDisposition) {
      throw new AppError("Choose the student's disposition in the consultation before generating the certificate", 409);
    }
    if (!isStudent && !entry.fitnessForWork) {
      throw new AppError("Choose Fit to Work or Not Fit to Work in the consultation before generating the certificate", 409);
    }

    const clinicSettings = await SystemSettings.findOne({ key: "clinic" })
      .select("clinicName buildingLocation floorRoom phoneNumber -_id")
      .lean();
    const clinicPhoneNumber = clinicSettings?.phoneNumber?.trim() || DEFAULT_CLINIC_PROFILE.phoneNumber;
    const clinicName = clinicSettings?.clinicName?.trim() || DEFAULT_CLINIC_PROFILE.clinicName;
    const clinicLocation = [
      clinicSettings?.buildingLocation || DEFAULT_CLINIC_PROFILE.buildingLocation,
      clinicSettings?.floorRoom || DEFAULT_CLINIC_PROFILE.floorRoom,
    ].filter(Boolean).join(", ");

    const buffer = await buildMedicalCertificateDocx({
      certificateId: String(entry._id),
      clinicName,
      clinicLocation,
      clinicPhoneNumber,
      patientName: `${patient.firstName} ${patient.lastName}`,
      ...(patient.age != null ? { patientAge: patient.age } : {}),
      ...(patient.gender ? { patientGender: patient.gender } : {}),
      patientType: isStudent ? "student" : "employee",
      patientIdentifierLabel,
      patientIdentifier,
      consultationDate: visit?.visitDate ?? entry.dateRecorded,
      complaint: visit?.complaint ?? "Not recorded",
      diagnosis: entry.diagnosis || "Not recorded",
      ...(entry.remarks ? { remarks: entry.remarks } : {}),
      physicianName: physician.name,
      ...(physician.licenseNumber ? { physicianLicenseNumber: physician.licenseNumber } : {}),
      ...(physician.ptrNumber ? { physicianPtrNumber: physician.ptrNumber } : {}),
      ...(studentDisposition ? { studentDisposition } : {}),
      ...(!isStudent && entry.fitnessForWork ? { fitnessForWork: entry.fitnessForWork } : {}),
    });

    void logAudit({
      action: "view",
      resource: "MedicalCertificate",
      resourceId: String(entry._id),
      performedBy: getAuthenticatedUser(req).id,
      method: req.method,
      path: req.originalUrl,
    });

    const safePatientId = patientIdentifier.replace(/[^a-zA-Z0-9_-]/g, "_");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Consultation_Certificate_${safePatientId}_${entry._id}.docx"`,
    );
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};
