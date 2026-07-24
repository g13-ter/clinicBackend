import { Request, Response, NextFunction } from "express";
import { MedicalHistoryService } from "../services/medicalHistory.service";
import { computeStatus } from "../services/medicine.service";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { mailer } from "../services/mailer.service";
import logger from "../utils/logger";

const medicalHistoryService = new MedicalHistoryService();
const userService = new UserService();

// CREATE
export const createMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthenticatedUser(req).id;
    const { patientId, diagnosis, prescription, prescribedItems, labRequest, familyHistory, allergies } = req.body;

    const { entry, stockChanges } = await medicalHistoryService.createMedicalHistory({
      patientId,
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

    // Each prescribed item deducted real stock - audit-log it as a
    // Medicine update too, same as a manual inventory edit would be.
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

    // Fire-and-forget: response already sent above, email failure must
    // never affect it. Only alert for items that just CROSSED into a
    // concerning status because of this prescription.
    const concerningStatuses = ["Low Stock", "Out of Stock", "Expired"];
    const newlyConcerning = stockChanges.filter((change) => {
      const before = { ...change.medicine.toObject(), quantity: change.previousQuantity };
      const beforeStatus = computeStatus(before as any);
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
                mailer.sendLowStockAlert({
                  to,
                  itemName: change.medicine.name,
                  quantity: change.medicine.quantity,
                  unit: change.medicine.unit,
                  status: computeStatus(change.medicine),
                })
              )
            )
          );
        } catch (emailError) {
          logger.error("Failed to send low stock alert email after prescription:", emailError);
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