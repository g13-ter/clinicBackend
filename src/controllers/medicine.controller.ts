import { Request, Response, NextFunction } from "express";
import Medicine, { IMedicine } from "../models/medicine.model";
import { AppError } from "../middleware/error.middleware";


// CREATE MEDICINE
export const createMedicine = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const {
      name,
      quantity,
      unit,
      expiryDate,
      lowStockThreshold
    } = req.body;


    const lastUpdatedBy = (req as any).user.id;


    const medicine = await Medicine.create({
      name,
      quantity,
      unit,
      expiryDate,
      lowStockThreshold,
      lastUpdatedBy
    });


    res.status(201).json({
      message: "Medicine added to inventory successfully",
      medicine
    });

  } catch (error) {

    next(error);

  }

};


// GET ALL MEDICINES
export const getMedicines = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const medicines = await Medicine.find().sort({
      name: 1
    });


    const medicinesWithFlag = medicines.map((med: IMedicine) => {

      return {
        ...med.toObject(),
        isLowStock: med.quantity <= med.lowStockThreshold
      };

    });


    res.status(200).json(medicinesWithFlag);

  } catch (error) {

    next(error);

  }

};


// GET SINGLE MEDICINE
export const getMedicineById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const medicine = await Medicine.findById(
      req.params.id
    );

    if (!medicine) {
      throw new AppError("Medicine not found", 404);
    }


    res.status(200).json({
      ...medicine.toObject(),
      isLowStock: medicine.quantity <= medicine.lowStockThreshold
    });

  } catch (error) {

    next(error);

  }

};


// UPDATE MEDICINE
export const updateMedicine = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const lastUpdatedBy = (req as any).user.id;

    const medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        lastUpdatedBy
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!medicine) {
      throw new AppError("Medicine not found", 404);
    }


    res.status(200).json({
      message: "Medicine updated successfully",
      medicine
    });

  } catch (error) {

    next(error);

  }

};


// GET LOW STOCK MEDICINES ONLY
export const getLowStockMedicines = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const medicines = await Medicine.find();

    const lowStock = medicines.filter(
      (med: IMedicine) => med.quantity <= med.lowStockThreshold
    );


    res.status(200).json(lowStock);

  } catch (error) {

    next(error);

  }

};