import type { NextFunction, Request, Response } from "express";
import { MedicationDispensingService } from "../services/medicationDispensing.service";
import { getAuthenticatedUser } from "../utils/authUser";
import { logAudit } from "../utils/auditLog";
import InAppNotification from "../models/inAppNotification.model";

const medicationDispensingService = new MedicationDispensingService();

const closeMedicationNotifications = (medicalHistoryId: string) =>
  InAppNotification.updateMany(
    { kind: "medication_order", resourceId: medicalHistoryId },
    { $set: { readAt: new Date() } },
  );

export const listMedicationOrders = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orders = await medicationDispensingService.listOpenOrders();
    res.status(200).json({ success: true, message: "Medication requests retrieved", data: orders });
  } catch (error) {
    next(error);
  }
};

export const listRecentAdministeredMedications = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orders = await medicationDispensingService.listRecentAdministered();
    res.status(200).json({ success: true, message: "Recent medication administrations retrieved", data: orders });
  } catch (error) {
    next(error);
  }
};

export const claimMedicationOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const nurseId = getAuthenticatedUser(req).id;
    const history = await medicationDispensingService.claim(id, nurseId);
    res.status(200).json({ success: true, message: "Medication request accepted", data: history });
  } catch (error) {
    next(error);
  }
};

export const dispenseMedicationOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const medicalHistoryId = req.params.id as string;
    const nurseId = getAuthenticatedUser(req).id;
    const { history, stockChanges } = await medicationDispensingService.dispense(
      medicalHistoryId,
      nurseId,
      { administrationNotes: req.body.administrationNotes },
    );

    for (const change of stockChanges) {
      logAudit({
        action: "update",
        resource: "Medicine",
        resourceId: String(change.medicine._id),
        performedBy: nurseId,
        before: { quantity: change.previousQuantity },
        after: { quantity: change.medicine.quantity },
        method: req.method,
        path: req.originalUrl,
      });
    }

    logAudit({
      action: "update",
      resource: "MedicalHistory",
      resourceId: medicalHistoryId,
      performedBy: nurseId,
      before: { medicationStatus: "accepted" },
      after: {
        medicationStatus: history.medicationStatus,
        medicationDispensedBy: history.medicationDispensedBy,
        medicationDispensedAt: history.medicationDispensedAt,
      },
      method: req.method,
      path: req.originalUrl,
    });

    await closeMedicationNotifications(medicalHistoryId);

    res.status(200).json({
      success: true,
      message: "Medication dispensing confirmed and inventory updated",
      data: history,
    });
  } catch (error) {
    next(error);
  }
};

export const markMedicationNotGiven = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const nurseId = getAuthenticatedUser(req).id;
    const history = await medicationDispensingService.markNotGiven(id, nurseId, req.body);
    logAudit({
      action: "update", resource: "MedicalHistory", resourceId: id, performedBy: nurseId,
      before: { medicationStatus: "accepted" },
      after: { medicationStatus: "not_given", reason: req.body.reason, notes: req.body.notes },
      method: req.method, path: req.originalUrl,
    });
    await closeMedicationNotifications(id);
    res.status(200).json({ success: true, message: "Medication marked as not given", data: history });
  } catch (error) {
    next(error);
  }
};

export const reportMedicationReaction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const nurseId = getAuthenticatedUser(req).id;
    const history = await medicationDispensingService.reportAdverseReaction(id, nurseId, req.body.details);
    logAudit({
      action: "update", resource: "MedicalHistory", resourceId: id, performedBy: nurseId,
      before: {}, after: { medicationAdverseReaction: req.body.details },
      method: req.method, path: req.originalUrl,
    });
    res.status(200).json({ success: true, message: "Adverse reaction recorded", data: history });
  } catch (error) {
    next(error);
  }
};
