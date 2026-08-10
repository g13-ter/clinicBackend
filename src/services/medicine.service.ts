import Medicine, { IMedicine } from "../models/medicine.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";
import type { ClientSession } from "mongoose";
import InventoryBatch from "../models/inventoryBatch.model";

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

interface BatchSummary {
  hasBatches: boolean;
  usableQuantity: number;
  expiredQuantity: number;
  earliestUsableExpiry?: Date;
  earliestExpiry?: Date;
}

const toMedicineView = (medicine: IMedicine, batch?: BatchSummary) => {
  const quantity = batch?.hasBatches ? batch.usableQuantity : medicine.quantity;
  const expiryDate = batch?.hasBatches
    ? (batch.earliestUsableExpiry ?? batch.earliestExpiry)
    : medicine.expiryDate;
  const statusSource: MedicineStatusFields = {
    quantity,
    lowStockThreshold: medicine.lowStockThreshold,
    ...(expiryDate ? { expiryDate } : {}),
  };
  return ({
  ...medicine.toObject(),
  quantity,
  expiryDate,
  usableQuantity: quantity,
  expiredQuantity: batch?.expiredQuantity ?? 0,
  hasExpiredStock: (batch?.expiredQuantity ?? 0) > 0,
  isLowStock: quantity <= medicine.lowStockThreshold,
  ...getExpiryFlags(expiryDate),
  status: computeStatus(statusSource),
  });
};

export type MedicineView = ReturnType<typeof toMedicineView>;

export class MedicineService {
  private async batchSummaries(medicineIds: string[]): Promise<Map<string, BatchSummary>> {
    const batches = await InventoryBatch.find({ medicineId: { $in: medicineIds }, quantityRemaining: { $gt: 0 } })
      .select("medicineId quantityRemaining expiryDate")
      .lean();
    const now = new Date();
    const summaries = new Map<string, BatchSummary>();
    for (const batch of batches) {
      const key = String(batch.medicineId);
      const summary: BatchSummary = summaries.get(key) ?? { hasBatches: true, usableQuantity: 0, expiredQuantity: 0 };
      const expired = Boolean(batch.expiryDate && batch.expiryDate < now);
      if (expired) summary.expiredQuantity += batch.quantityRemaining;
      else {
        summary.usableQuantity += batch.quantityRemaining;
        if (batch.expiryDate && (!summary.earliestUsableExpiry || batch.expiryDate < summary.earliestUsableExpiry)) {
          summary.earliestUsableExpiry = batch.expiryDate;
        }
      }
      if (batch.expiryDate && (!summary.earliestExpiry || batch.expiryDate < summary.earliestExpiry)) {
        summary.earliestExpiry = batch.expiryDate;
      }
      summaries.set(key, summary);
    }
    return summaries;
  }

  async createMedicine(data: Partial<IMedicine>, session?: ClientSession): Promise<IMedicine> {
    if (session) {
      const [medicine] = await Medicine.create([data], { session });
      if (!medicine) throw new Error("Medicine was not created");
      return medicine;
    }
    return await Medicine.create(data);
  }

  async getMedicines(
    { limit, skip }: PaginationParams,
    search?: string
  ): Promise<{ medicines: MedicineView[]; total: number }> {
    const filter: { name?: { $regex: string; $options: "i" }; isActive: true } = { isActive: true };

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

    const summaries = await this.batchSummaries(medicines.map((medicine) => String(medicine._id)));
    return {
      medicines: medicines.map((medicine) => toMedicineView(medicine, summaries.get(String(medicine._id)))),
      total,
    };
  }

  async getMedicineById(id: string): Promise<MedicineView> {
    const medicine = await Medicine.findOne({ _id: id, isActive: true }).populate("lastUpdatedBy", "name role");

    if (!medicine) {
      throw new AppError("Medicine not found", 404);
    }

    const summaries = await this.batchSummaries([String(medicine._id)]);
    return toMedicineView(medicine, summaries.get(String(medicine._id)));
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

  async getLowStockMedicines(): Promise<MedicineView[]> {
    const medicines = await Medicine.find({ isActive: true });
    const summaries = await this.batchSummaries(medicines.map((medicine) => String(medicine._id)));
    return medicines
      .map((medicine) => toMedicineView(medicine, summaries.get(String(medicine._id))))
      .filter((medicine) => medicine.quantity <= medicine.lowStockThreshold);
  }

  async deleteMedicine(id: string, discontinuedBy: string): Promise<IMedicine> {
    const medicine = await Medicine.findOneAndUpdate(
      { _id: id, isActive: true },
      { isActive: false, discontinuedAt: new Date(), discontinuedBy, lastUpdatedBy: discontinuedBy },
      { returnDocument: "after" },
    );
    if (!medicine) {
      throw new AppError("Medicine not found", 404);
    }
    return medicine;
  }

  async getExpiringMedicines(): Promise<MedicineView[]> {
    const medicines = await Medicine.find({ isActive: true });
    const summaries = await this.batchSummaries(medicines.map((medicine) => String(medicine._id)));
    return medicines
      .map((medicine) => toMedicineView(medicine, summaries.get(String(medicine._id))))
      .filter((medicine) => medicine.isExpired || medicine.isExpiringSoon || medicine.hasExpiredStock);
  }
}
