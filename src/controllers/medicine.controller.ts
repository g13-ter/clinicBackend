import { Request, Response, NextFunction } from "express";
import { MedicineService } from "../services/medicine.service";

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

    res.status(201).json({ message: "Medicine added to inventory successfully", medicine });
  } catch (error) {
    next(error);
  }
};

// GET ALL
export const getMedicines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const medicines = await medicineService.getMedicines();
    res.status(200).json(medicines);
  } catch (error) {
    next(error);
  }
};

// GET BY ID
export const getMedicineById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const medicine = await medicineService.getMedicineById(id);
    res.status(200).json(medicine);
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateMedicine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string; // ✅ cast to string
    const lastUpdatedBy = (req as any).user.id;

    const medicine = await medicineService.updateMedicine(id, {
      ...req.body,
      lastUpdatedBy,
    });

    res.status(200).json({ message: "Medicine updated successfully", medicine });
  } catch (error) {
    next(error);
  }
};

// GET LOW STOCK
export const getLowStockMedicines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const lowStock = await medicineService.getLowStockMedicines();
    res.status(200).json(lowStock);
  } catch (error) {
    next(error);
  }
};
