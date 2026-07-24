import { Request, Response, NextFunction } from "express";
import { MedicineService, computeStatus } from "../services/medicine.service";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { mailer } from "../services/mailer.service";
import logger from "../utils/logger";

const medicineService = new MedicineService();
const userService = new UserService();

// CREATE
export const createMedicine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthenticatedUser(req).id;
    const { name, category, quantity, unit, expiryDate, lowStockThreshold, supplier, dateReceived } = req.body;

    const medicine = await medicineService.createMedicine({
      name,
      category,
      quantity,
      unit,
      expiryDate,
      lowStockThreshold,
      supplier,
      dateReceived,
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

    // Fire-and-forget: response already sent above, email failure must
    // never affect it. Only alert when the update just CROSSED into a
    // concerning status (e.g. Available -> Low Stock) - not on every
    // update to an item that was already low/out/expired, which would
    // spam admins on every unrelated edit.
    const concerningStatuses = ["Low Stock", "Out of Stock", "Expired"];
    const beforeStatus = computeStatus(before);
    const afterStatus = computeStatus(after);

    if (concerningStatuses.includes(afterStatus) && beforeStatus !== afterStatus) {
      (async () => {
        try {
          const adminEmails = await userService.getAdminEmails();
          await Promise.all(
            adminEmails.map((to) =>
              mailer.sendLowStockAlert({
                to,
                itemName: after.name,
                quantity: after.quantity,
                unit: after.unit,
                status: afterStatus,
              })
            )
          );
        } catch (emailError) {
          logger.error("Failed to send low stock alert email:", emailError);
        }
      })();
    }
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

// DELETE — remove an expired or discontinued item from inventory
export const deleteMedicine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;

    const deleted = await medicineService.deleteMedicine(id);

    logAudit({
      action: "delete",
      resource: "Medicine",
      resourceId: id,
      performedBy: userId,
      before: deleted.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Medicine removed from inventory successfully" });
  } catch (error) {
    next(error);
  }
};

// GET EXPIRING/EXPIRED
// Not audit-logged, same reasoning as low stock - an alert/dashboard-style endpoint.
export const getExpiringMedicines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const expiring = await medicineService.getExpiringMedicines();
    res.status(200).json({ success: true, message: "Expiring medicines retrieved successfully", data: expiring });
  } catch (error) {
    next(error);
  }
};