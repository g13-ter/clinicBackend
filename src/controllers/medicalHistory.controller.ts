import { Request, Response, NextFunction } from "express";
import { MedicalHistoryService } from "../services/medicalHistory.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import logger, { errorMetadata } from "../utils/logger";
import { AppError } from "../middleware/error.middleware";
import { buildMedicalCertificateDocx } from "../utils/medicalCertificateDocx";
import Patient from "../models/patient.model";
import { notifyActiveNurses } from "../services/inAppNotification.service";

const medicalHistoryService = new MedicalHistoryService();

// CREATE
export const createMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const actor = getAuthenticatedUser(req);
    const userId = actor.id;
    const { patientId, visitId, diagnosis, prescription, prescribedItems, labRequest, familyHistory, allergies, closureOutcome } = req.body;

    if (actor.role === "nurse") {
      if (!Array.isArray(prescribedItems) || prescribedItems.length === 0) {
        throw new AppError("A nurse-created medical history entry must include a medication order", 400);
      }
      if (diagnosis || labRequest || familyHistory || allergies) {
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
      firstName?: string;
      lastName?: string;
      studentId?: string;
    };
    const physician = entry.recordedBy as unknown as {
      name?: string;
      role?: string;
    };
    const visit = entry.visitId as unknown as {
      visitDate?: Date;
      complaint?: string;
    } | undefined;

    if (!patient?.firstName || !patient?.lastName || !patient?.studentId) {
      throw new AppError("The student record is incomplete and a certificate cannot be generated", 409);
    }
    if (!physician?.name || physician.role !== "doctor") {
      throw new AppError("A certificate requires a saved physician consultation", 409);
    }

    const medications = (entry.prescribedItems ?? []).map((item) => {
      const instruction = item.instructions ? ` — ${item.instructions}` : "";
      return `${item.medicineName}, ${item.quantity} ${item.unit}${instruction}`;
    });
    const buffer = await buildMedicalCertificateDocx({
      certificateId: String(entry._id),
      studentName: `${patient.firstName} ${patient.lastName}`,
      studentId: patient.studentId,
      consultationDate: visit?.visitDate ?? entry.dateRecorded,
      complaint: visit?.complaint ?? "Not recorded",
      diagnosis: entry.diagnosis || "Not recorded",
      ...(entry.prescription ? { treatmentPlan: entry.prescription } : {}),
      ...(entry.labRequest ? { labRequest: entry.labRequest } : {}),
      medications,
      physicianName: physician.name,
    });

    void logAudit({
      action: "view",
      resource: "MedicalCertificate",
      resourceId: String(entry._id),
      performedBy: getAuthenticatedUser(req).id,
      method: req.method,
      path: req.originalUrl,
    });

    const safeStudentId = patient.studentId.replace(/[^a-zA-Z0-9_-]/g, "_");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Consultation_Certificate_${safeStudentId}_${entry._id}.docx"`,
    );
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};
