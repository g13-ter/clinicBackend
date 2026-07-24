import MedicalHistory, { IMedicalHistory, IPrescribedItem } from "../models/medicalHistory.model";
import Medicine, { IMedicine } from "../models/medicine.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";

export interface StockChange {
  medicine: IMedicine;
  previousQuantity: number;
}

export class MedicalHistoryService {
  async createMedicalHistory(
    data: Partial<IMedicalHistory> & { prescribedItems?: { medicineId: string; quantity: number; instructions?: string }[] }
  ): Promise<{ entry: IMedicalHistory; stockChanges: StockChange[] }> {
    const requestedItems = data.prescribedItems ?? [];
    const stockChanges: StockChange[] = [];
    const snapshotItems: IPrescribedItem[] = [];

    if (requestedItems.length > 0) {
      // Validate every line BEFORE touching any stock, so a request that's
      // only partially fulfillable fails cleanly instead of deducting some
      // items and rejecting others.
      const medicinePairs = await Promise.all(
        requestedItems.map(async (item) => ({
          requested: item,
          medicine: await Medicine.findById(item.medicineId),
        }))
      );

      for (const pair of medicinePairs) {
        if (!pair.medicine) {
          throw new AppError(`Medicine not found: ${pair.requested.medicineId}`, 404);
        }
        if (pair.medicine.quantity < pair.requested.quantity) {
          throw new AppError(
            `Insufficient stock for "${pair.medicine.name}": ${pair.requested.quantity} requested, only ${pair.medicine.quantity} ${pair.medicine.unit} available`,
            400
          );
        }
      }

      // All lines validated - now deduct. Each deduction uses an atomic
      // conditional $inc (quantity: { $gte: requested }) as a second line
      // of defense against a concurrent request racing us between the
      // check above and this update; if that race is lost, we fail loudly
      // rather than silently allowing negative stock.
      for (const pair of medicinePairs) {
        const { requested } = pair;
        const medicineBefore = pair.medicine as IMedicine;

        const updated = await Medicine.findOneAndUpdate(
          { _id: requested.medicineId, quantity: { $gte: requested.quantity } },
          { $inc: { quantity: -requested.quantity } },
          { new: true }
        );

        if (!updated) {
          throw new AppError(
            `Stock for "${medicineBefore.name}" changed before this prescription could be completed - please try again`,
            409
          );
        }

        stockChanges.push({ medicine: updated, previousQuantity: medicineBefore.quantity });
        snapshotItems.push({
          medicineId: updated._id as any,
          medicineName: medicineBefore.name,
          quantity: requested.quantity,
          unit: medicineBefore.unit,
          ...(requested.instructions ? { instructions: requested.instructions } : {}),
        });
      }
    }

    const entry = await MedicalHistory.create({
      ...data,
      ...(snapshotItems.length > 0 ? { prescribedItems: snapshotItems } : {}),
    });

    return { entry, stockChanges };
  }

  async getHistoryByPatient(
    patientId: string,
    { limit, skip }: PaginationParams
  ): Promise<{ history: IMedicalHistory[]; total: number }> {
    if (!patientId) {
      throw new AppError("Patient ID is required", 400);
    }

    const filter = { patientId };

    const [history, total] = await Promise.all([
      MedicalHistory.find(filter)
        .populate("patientId")
        .populate("recordedBy", "name role")
        .populate("updatedBy", "name role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      MedicalHistory.countDocuments(filter),
    ]);

    return { history, total };
  }

  async getHistoryById(id: string): Promise<IMedicalHistory> {
    const entry = await MedicalHistory.findById(id)
      .populate("patientId")
      .populate("recordedBy", "name role")
      .populate("updatedBy", "name role");

    if (!entry) {
      throw new AppError("Medical history entry not found", 404);
    }

    return entry;
  }

  async updateMedicalHistory(id: string, data: Partial<IMedicalHistory>): Promise<{ before: IMedicalHistory; after: IMedicalHistory }> {
    const before = await MedicalHistory.findById(id);

    if (!before) {
      throw new AppError("Medical history entry not found", 404);
    }

    const after = await MedicalHistory.findByIdAndUpdate(id, data, {
      returnDocument: "after",
      runValidators: true,
    });

    if (!after) {
      throw new AppError("Medical history entry not found", 404);
    }

    return { before, after };
  }
}