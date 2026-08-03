import { Request, Response, NextFunction } from "express";
import { MedicalHistoryService } from "../services/medicalHistory.service";
import { computeStatus } from "../services/medicine.service";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { enqueueNotification } from "../services/notificationOutbox.service";
import logger, { errorMetadata } from "../utils/logger";
import { AppError } from "../middleware/error.middleware";
import { buildMedicalCertificateDocx } from "../utils/medicalCertificateDocx";

const medicalHistoryService = new MedicalHistoryService();
const userService = new UserService();

// CREATE
export const createMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthenticatedUser(req).id;
    const { patientId, visitId, diagnosis, prescription, prescribedItems, labRequest, familyHistory, allergies } = req.body;

    const { entry, stockChanges } = await medicalHistoryService.createMedicalHistory({
      patientId,
      visitId,
      diagnosis,
      prescription,
      prescribedItems,
      labRequest,
      familyHistory,
      allergies,
      recordedBy: getAuthenticatedObjectId(req),
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

    // Audit prescription deductions as inventory updates.
    for (const change of stockChanges) {
      logAudit({
        action: "update",
        resource: "Medicine",
        resourceId: String(change.medicine._id),
        performedBy: userId,
        before: { quantity: change.previousQuantity },
        after: { quantity: change.medicine.quantity },
        method: req.method,
        path: req.originalUrl,
      });
    }

    res.status(201).json({ success: true, message: "Medical history entry created successfully", data: entry });

    // Alert only for items that entered a concerning status.
    const concerningStatuses = ["Low Stock", "Out of Stock", "Expired"];
    const newlyConcerning = stockChanges.filter((change) => {
      const before = { ...change.medicine.toObject(), quantity: change.previousQuantity };
      const beforeStatus = computeStatus(before);
      const afterStatus = computeStatus(change.medicine);
      return concerningStatuses.includes(afterStatus) && beforeStatus !== afterStatus;
    });

    if (newlyConcerning.length > 0) {
      (async () => {
        try {
          const adminEmails = await userService.getAdminEmails();
          await Promise.all(
            newlyConcerning.flatMap((change) =>
              adminEmails.map((to) =>
                enqueueNotification({
                  kind: "low_stock",
                  recipient: to,
                  dedupeKey: `low-stock:${change.medicine._id}:${computeStatus(change.medicine)}:${change.medicine.quantity}:${to}`,
                  payload: {
                    itemName: change.medicine.name,
                    quantity: change.medicine.quantity,
                    unit: change.medicine.unit,
                    status: computeStatus(change.medicine),
                  },
                })
              )
            )
          );
        } catch (emailError) {
          logger.error("prescription_low_stock_alert_enqueue_failed", errorMetadata(emailError));
        }
      })();
    }
  } catch (error) {
    next(error);
  }
};

// GET ALL BY PATIENT — read-only, not audit-logged
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

// GET BY ID — read-only, not audit-logged
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
    const userId = getAuthenticatedUser(req).id;
    const { before, after } = await medicalHistoryService.updateMedicalHistory(id, {
      ...req.body,
      updatedBy: getAuthenticatedObjectId(req),
    });

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
    const entry = await medicalHistoryService.getHistoryById(req.params.id as string);
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
