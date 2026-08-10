import { Request, Response, NextFunction } from "express";
import { MedicineService, computeStatus } from "../services/medicine.service";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { enqueueNotification } from "../services/notificationOutbox.service";
import logger, { errorMetadata } from "../utils/logger";
import StockMovement from "../models/stockMovement.model";
import { assertInventoryPeriodOpen } from "../services/monthlyInventory.service";
import InventoryBatch from "../models/inventoryBatch.model";
import { withMongoTransaction } from "../utils/transaction";

const medicineService = new MedicineService();
const userService = new UserService();

// CREATE
export const createMedicine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthenticatedUser(req).id;
    const { name, category, quantity, unit, expiryDate, lowStockThreshold, supplier, dateReceived, batchNumber } = req.body;
    const receivedAt = dateReceived ? new Date(dateReceived) : new Date();
    await assertInventoryPeriodOpen(receivedAt);

    const medicine = await withMongoTransaction(async (session) => {
      const created = await medicineService.createMedicine({
        name,
        category,
        quantity,
        unit,
        expiryDate,
        lowStockThreshold,
        supplier,
        dateReceived: receivedAt,
        lastUpdatedBy: getAuthenticatedObjectId(req),
      }, session);

      let batchId;
      if (created.quantity > 0 && batchNumber) {
        const [batch] = await InventoryBatch.create([{
          medicineId: created._id,
          batchNumber,
          quantityReceived: created.quantity,
          quantityRemaining: created.quantity,
          ...(expiryDate ? { expiryDate } : {}),
          ...(supplier ? { supplier } : {}),
          receivedAt,
          receivedBy: getAuthenticatedObjectId(req),
          notes: "Initial batch recorded when medicine was created",
        }], session ? { session } : {});
        batchId = batch?._id;
      }

      if (created.quantity > 0) {
        await StockMovement.create([{
          medicineId: created._id,
          ...(batchId ? { batchId } : {}),
          type: "initial_stock",
          quantityChange: created.quantity,
          balanceAfter: created.quantity,
          occurredAt: receivedAt,
          performedBy: getAuthenticatedObjectId(req),
          notes: "Initial stock recorded when medicine was created",
        }], session ? { session } : {});
      }
      return created;
    });

    logAudit({
      action: "create",
      resource: "Medicine",
      resourceId: String(medicine._id),
      performedBy: userId,
      after: medicine.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(201).json({ success: true, message: "Medicine added to inventory successfully", data: medicine });
  } catch (error) {
    next(error);
  }
};

// Prescribing intentionally exposes no supplier, batch, expiry, or mutation metadata.
export const getPrescriptionMedicines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const search = req.query.search as string | undefined;
    const pagination = getPaginationParams(req.query);
    const { medicines, total } = await medicineService.getMedicines(pagination, search);
    const data = medicines.map((medicine) => ({
      _id: medicine._id,
      name: medicine.name,
      unit: medicine.unit,
      quantity: medicine.quantity,
      status: medicine.status,
      isLowStock: medicine.isLowStock,
    }));
    res.json({
      success: true,
      message: "Prescription medicines retrieved successfully",
      data,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) { next(error); }
};

// GET ALL — read-only, not audit-logged
export const getMedicines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const search = req.query.search as string | undefined;
    const pagination = getPaginationParams(req.query);

    const { medicines, total } = await medicineService.getMedicines(pagination, search);

    res.status(200).json({
      success: true,
      message: "Medicines retrieved successfully",
      data: medicines,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};

// GET BY ID — read-only, not audit-logged
export const getMedicineById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const medicine = await medicineService.getMedicineById(id);

    res.status(200).json({ success: true, message: "Medicine retrieved successfully", data: medicine });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateMedicine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;

    const { before, after } = await medicineService.updateMedicine(id, {
      ...req.body,
      lastUpdatedBy: getAuthenticatedObjectId(req),
    });

    logAudit({
      action: "update",
      resource: "Medicine",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Medicine updated successfully", data: after });

    // Alert only when an item enters a concerning status.
    const concerningStatuses = ["Low Stock", "Out of Stock", "Expired"];
    const beforeStatus = computeStatus(before);
    const afterStatus = computeStatus(after);

    if (concerningStatuses.includes(afterStatus) && beforeStatus !== afterStatus) {
      (async () => {
        try {
          const adminEmails = await userService.getAdminEmails();
          await Promise.all(
            adminEmails.map((to) =>
              enqueueNotification({
                kind: "low_stock",
                recipient: to,
                dedupeKey: `low-stock:${after._id}:${afterStatus}:${after.quantity}:${to}`,
                payload: {
                  itemName: after.name,
                  quantity: after.quantity,
                  unit: after.unit,
                  status: afterStatus,
                },
              })
            )
          );
        } catch (emailError) {
          logger.error("low_stock_alert_enqueue_failed", errorMetadata(emailError));
        }
      })();
    }
  } catch (error) {
    next(error);
  }
};

// GET LOW STOCK — polled alert data, not audit-logged
export const getLowStockMedicines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const lowStock = await medicineService.getLowStockMedicines();
    res.status(200).json({ success: true, message: "Low stock medicines retrieved successfully", data: lowStock });
  } catch (error) {
    next(error);
  }
};

// DELETE — remove an expired or discontinued item from inventory
export const deleteMedicine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;

    const deleted = await medicineService.deleteMedicine(id, userId);

    logAudit({
      action: "delete",
      resource: "Medicine",
      resourceId: id,
      performedBy: userId,
      before: deleted.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Medicine discontinued successfully" });
  } catch (error) {
    next(error);
  }
};

// GET EXPIRING/EXPIRED — polled alert data, not audit-logged
export const getExpiringMedicines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const expiring = await medicineService.getExpiringMedicines();
    res.status(200).json({ success: true, message: "Expiring medicines retrieved successfully", data: expiring });
  } catch (error) {
    next(error);
  }
};
