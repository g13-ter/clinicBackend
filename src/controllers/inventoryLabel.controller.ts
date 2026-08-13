import type { NextFunction, Request, Response } from "express";
import { InventoryLabelService } from "../services/inventoryLabel.service";
import { getAuthenticatedUser } from "../utils/authUser";
import { logAudit } from "../utils/auditLog";
import AuditLog from "../models/auditLog.model";

const service = new InventoryLabelService();

export const listInventoryLabels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const data = await service.list(user.id, req.query.includeArchived === "true");
    res.json({ success: true, message: "Inventory labels retrieved", data });
  } catch (error) { next(error); }
};

export const listInventoryLabelActivity = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AuditLog.find({ resource: { $in: ["InventoryLabel", "InventoryLabelOrder", "InventoryLabelAssignment"] } })
      .select("action resource resourceId actorSnapshot changes createdAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, message: "Inventory label activity retrieved", data });
  } catch (error) { next(error); }
};

export const createInventoryLabel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const label = await service.create(req.body, user.id);
    await logAudit({ action: "create", resource: "InventoryLabel", resourceId: String(label._id), performedBy: user.id, after: label.toObject(), method: req.method, path: req.originalUrl });
    res.status(201).json({ success: true, message: "Inventory label created", data: label });
  } catch (error) { next(error); }
};

export const updateInventoryLabel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const { before, after } = await service.update(req.params.id as string, req.body);
    await logAudit({ action: "update", resource: "InventoryLabel", resourceId: String(after._id), performedBy: user.id, before: before.toObject(), after: after.toObject(), method: req.method, path: req.originalUrl });
    res.json({ success: true, message: "Inventory label updated", data: after });
  } catch (error) { next(error); }
};

export const reorderInventoryLabels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    await service.reorder(req.body.labelIds);
    await logAudit({ action: "update", resource: "InventoryLabelOrder", resourceId: "active-labels", performedBy: user.id, after: { labelIds: req.body.labelIds }, method: req.method, path: req.originalUrl });
    res.json({ success: true, message: "Label order saved", data: null });
  } catch (error) { next(error); }
};

export const assignInventoryLabel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const moved = await service.assign(req.params.id as string, req.body.medicineIds, user.id);
    await logAudit({ action: "update", resource: "InventoryLabelAssignment", resourceId: req.params.id as string, performedBy: user.id, after: { medicineIds: req.body.medicineIds, moved }, method: req.method, path: req.originalUrl });
    res.json({ success: true, message: `${moved} inventory item(s) reassigned`, data: { moved } });
  } catch (error) { next(error); }
};

export const archiveInventoryLabel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const label = await service.archive(req.params.id as string, user.id);
    await logAudit({ action: "deactivate", resource: "InventoryLabel", resourceId: String(label._id), performedBy: user.id, before: { name: label.name, isActive: true }, after: label.toObject(), method: req.method, path: req.originalUrl });
    res.json({ success: true, message: "Inventory label archived", data: label });
  } catch (error) { next(error); }
};

export const mergeInventoryLabels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const result = await service.merge(req.params.id as string, req.body.targetLabelId, user.id);
    await logAudit({ action: "update", resource: "InventoryLabel", resourceId: String(result.source._id), performedBy: user.id, before: { name: result.source.name, isActive: true }, after: { mergedInto: result.target.name, movedItems: result.moved, isActive: false }, method: req.method, path: req.originalUrl });
    res.json({ success: true, message: `Labels merged; ${result.moved} item(s) moved`, data: result });
  } catch (error) { next(error); }
};
