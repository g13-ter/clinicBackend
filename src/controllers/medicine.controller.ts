import { Request, Response, NextFunction } from "express";
import { MedicineService } from "../services/medicine.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";

const medicineService = new MedicineService();

// CREATE
export const createMedicine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthenticatedUser(req).id;
    const { name, quantity, unit, expiryDate, lowStockThreshold } = req.body;

    const medicine = await medicineService.createMedicine({
      name,
      quantity,
      unit,
      expiryDate,
      lowStockThreshold,
      lastUpdatedBy: getAuthenticatedObjectId(req),
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
  } catch (error) {
    next(error);
  }
};

// GET LOW STOCK
// Not audit-logged - this is an alert/dashboard-style endpoint, likely
// polled often, and doesn't represent someone deliberately looking up
// a specific record.
export const getLowStockMedicines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const lowStock = await medicineService.getLowStockMedicines();
    res.status(200).json({ success: true, message: "Low stock medicines retrieved successfully", data: lowStock });
  } catch (error) {
    next(error);
  }
};