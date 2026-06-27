import { Request, Response, NextFunction } from "express";
import { MedicineService } from "../services/medicine.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";

const medicineService = new MedicineService();

// CREATE
export const createMedicine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, quantity, unit, expiryDate, lowStockThreshold } = req.body;
    const lastUpdatedBy = (req as any).user.id;

    const medicine = await medicineService.createMedicine({
      name,
      quantity,
      unit,
      expiryDate,
      lowStockThreshold,
      lastUpdatedBy,
    });

    res.status(201).json({ success: true, message: "Medicine added to inventory successfully", data: medicine });
  } catch (error) {
    next(error);
  }
};

// GET ALL
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

// GET BY ID
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
    const lastUpdatedBy = (req as any).user.id;

    const medicine = await medicineService.updateMedicine(id, {
      ...req.body,
      lastUpdatedBy,
    });

    res.status(200).json({ success: true, message: "Medicine updated successfully", data: medicine });
  } catch (error) {
    next(error);
  }
};

// GET LOW STOCK — not paginated, this is an alert list and should show everything urgent
export const getLowStockMedicines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const lowStock = await medicineService.getLowStockMedicines();
    res.status(200).json({ success: true, message: "Low stock medicines retrieved successfully", data: lowStock });
  } catch (error) {
    next(error);
  }
};