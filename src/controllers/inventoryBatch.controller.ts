import { NextFunction, Request, Response } from "express";
import { InventoryBatchService } from "../services/inventoryBatch.service";
import { getAuthenticatedUser } from "../utils/authUser";
import { logAudit } from "../utils/auditLog";

const inventoryBatchService = new InventoryBatchService();

export const createInventoryBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const medicineId = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;
    const batch = await inventoryBatchService.createBatch({ medicineId, ...req.body, receivedBy: userId });
    logAudit({ action: "create", resource: "InventoryBatch", resourceId: String(batch._id), performedBy: userId, after: batch.toObject(), method: req.method, path: req.originalUrl });
    res.status(201).json({ success: true, message: "Medicine batch received successfully", data: batch });
  } catch (error) {
    next(error);
  }
};

export const getInventoryBatches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const batches = await inventoryBatchService.getBatches(req.params.id as string);
    res.status(200).json({ success: true, message: "Medicine batches retrieved successfully", data: batches });
  } catch (error) {
    next(error);
  }
};
