import Medicine, { IMedicine } from "../models/medicine.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";

// Medicines within this many days of expiryDate are flagged as expiring soon.
const EXPIRING_SOON_DAYS = 30;

const getExpiryFlags = (expiryDate: Date | undefined | null) => {
  if (!expiryDate) {
    return { isExpired: false, isExpiringSoon: false };
  }

  const now = new Date();
  const soonThreshold = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

  return {
    isExpired: expiryDate < now,
    isExpiringSoon: expiryDate >= now && expiryDate <= soonThreshold,
  };
};

// Status priority: Expired, Out of Stock, Low Stock, Available.
export type MedicineStatus = "Available" | "Low Stock" | "Out of Stock" | "Expired";

interface MedicineStatusFields {
  expiryDate?: Date;
  quantity: number;
  lowStockThreshold: number;
}

export const computeStatus = (med: MedicineStatusFields): MedicineStatus => {
  const { isExpired } = getExpiryFlags(med.expiryDate);
  if (isExpired) return "Expired";
  if (med.quantity <= 0) return "Out of Stock";
  if (med.quantity <= med.lowStockThreshold) return "Low Stock";
  return "Available";
};

const toMedicineView = (medicine: IMedicine) => ({
  ...medicine.toObject(),
  isLowStock: medicine.quantity <= medicine.lowStockThreshold,
  ...getExpiryFlags(medicine.expiryDate),
  status: computeStatus(medicine),
});

export type MedicineView = ReturnType<typeof toMedicineView>;

export class MedicineService {
  async createMedicine(data: Partial<IMedicine>): Promise<IMedicine> {
    return await Medicine.create(data);
  }

  async getMedicines(
    { limit, skip }: PaginationParams,
    search?: string
  ): Promise<{ medicines: MedicineView[]; total: number }> {
    const filter: { name?: { $regex: string; $options: "i" } } = {};

    if (search) {
      filter.name = { $regex: escapeRegex(search), $options: "i" };
    }

    const [medicines, total] = await Promise.all([
      Medicine.find(filter)
        .populate("lastUpdatedBy", "name role")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Medicine.countDocuments(filter),
    ]);

    return {
      medicines: medicines.map(toMedicineView),
      total,
    };
  }

  async getMedicineById(id: string): Promise<MedicineView> {
    const medicine = await Medicine.findById(id).populate("lastUpdatedBy", "name role");

    if (!medicine) {
      throw new AppError("Medicine not found", 404);
    }

    return toMedicineView(medicine);
  }

  async updateMedicine(id: string, data: Partial<IMedicine>): Promise<{ before: IMedicine; after: IMedicine }> {
    const before = await Medicine.findById(id);

    if (!before) {
      throw new AppError("Medicine not found", 404);
    }

    const after = await Medicine.findByIdAndUpdate(id, data, {
      returnDocument: "after",
      runValidators: true,
    });

    if (!after) {
      throw new AppError("Medicine not found", 404);
    }

    return { before, after };
  }

  async getLowStockMedicines(): Promise<IMedicine[]> {
    const medicines = await Medicine.find();
    return medicines.filter((med: IMedicine) => med.quantity <= med.lowStockThreshold);
  }

  async deleteMedicine(id: string): Promise<IMedicine> {
    const medicine = await Medicine.findByIdAndDelete(id);
    if (!medicine) {
      throw new AppError("Medicine not found", 404);
    }
    return medicine;
  }

  async getExpiringMedicines(): Promise<(IMedicine & { isExpired: boolean; isExpiringSoon: boolean })[]> {
    const medicines = await Medicine.find();
    return medicines
      .map((med: IMedicine) => ({ ...med.toObject(), ...getExpiryFlags(med.expiryDate) }))
      .filter((med) => med.isExpired || med.isExpiringSoon);
  }
}
