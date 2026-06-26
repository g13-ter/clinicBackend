import Medicine, { IMedicine } from "../models/medicine.model";
import { AppError } from "../middleware/error.middleware";

export class MedicineService {
  async createMedicine(data: Partial<IMedicine>): Promise<IMedicine> {
    return await Medicine.create(data);
  }

  async getMedicines(): Promise<(IMedicine & { isLowStock: boolean })[]> {
    const medicines = await Medicine.find().sort({ name: 1 });

    return medicines.map((med: IMedicine) => ({
      ...med.toObject(),
      isLowStock: med.quantity <= med.lowStockThreshold,
    }));
  }

async getMedicineById(id: string): Promise<any> {
  const medicine = await Medicine.findById(id);

  if (!medicine) {
    throw new AppError("Medicine not found", 404);
  }

  return {
    ...medicine.toObject(),
    isLowStock: medicine.quantity <= medicine.lowStockThreshold,
  };
}



  async updateMedicine(id: string, data: Partial<IMedicine>): Promise<IMedicine> {
    const medicine = await Medicine.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!medicine) {
      throw new AppError("Medicine not found", 404);
    }

    return medicine;
  }

  async getLowStockMedicines(): Promise<IMedicine[]> {
    const medicines = await Medicine.find();
    return medicines.filter((med: IMedicine) => med.quantity <= med.lowStockThreshold);
  }
}
