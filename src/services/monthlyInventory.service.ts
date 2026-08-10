import mongoose from "mongoose";
import InventoryBatch from "../models/inventoryBatch.model";
import Medicine from "../models/medicine.model";
import MonthlyInventoryReport, {
  type IMonthlyInventoryItem,
  type IMonthlyInventoryReport,
} from "../models/monthlyInventoryReport.model";
import StockMovement from "../models/stockMovement.model";
import { AppError } from "../middleware/error.middleware";
import { computeStatus } from "./medicine.service";
import { withMongoTransaction } from "../utils/transaction";

type ReconciliationInput = {
  medicineId: string;
  physicalCount: number;
  varianceNotes?: string;
};

const periodBounds = (year: number, month: number) => ({
  start: new Date(Date.UTC(year, month - 1, 1)),
  end: new Date(Date.UTC(year, month, 1)),
});

const validatePeriod = (year: number, month: number): void => {
  if (!Number.isInteger(year) || year < 2000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError("A valid inventory reporting month and year are required", 400);
  }
};

export const assertInventoryPeriodOpen = async (occurredAt: Date): Promise<void> => {
  const month = occurredAt.getUTCMonth() + 1;
  const year = occurredAt.getUTCFullYear();
  const finalized = await MonthlyInventoryReport.exists({ month, year, status: "finalized" });
  if (finalized) {
    throw new AppError("Inventory transactions cannot be backdated into a finalized month", 409);
  }
};

export class MonthlyInventoryService {
  private async calculateItems(year: number, month: number): Promise<IMonthlyInventoryItem[]> {
    validatePeriod(year, month);
    const { start, end } = periodBounds(year, month);
    const previous = await MonthlyInventoryReport.findOne({
      status: "finalized",
      $or: [{ year: { $lt: year } }, { year, month: { $lt: month } }],
    }).sort({ year: -1, month: -1 }).lean();

    const [medicines, movements, batches] = await Promise.all([
      Medicine.find().sort({ name: 1 }).lean(),
      StockMovement.find({ occurredAt: { $gte: start, $lt: end } }).lean(),
      InventoryBatch.find().sort({ expiryDate: 1 }).lean(),
    ]);
    const previousByMedicine = new Map(
      (previous?.items ?? []).map((item) => [String(item.medicineId), item]),
    );
    const movementByMedicine = new Map<string, typeof movements>();
    for (const movement of movements) {
      const key = String(movement.medicineId);
      movementByMedicine.set(key, [...(movementByMedicine.get(key) ?? []), movement]);
    }
    const priorBalances = await Promise.all(medicines.map(async (medicine) => {
      const previousItem = previousByMedicine.get(String(medicine._id));
      if (previousItem) return previousItem.physicalCount ?? previousItem.calculatedEndingBalance;
      const lastMovement = await StockMovement.findOne({ medicineId: medicine._id, occurredAt: { $lt: start } })
        .sort({ occurredAt: -1, createdAt: -1 })
        .select("balanceAfter")
        .lean();
      return lastMovement?.balanceAfter ?? 0;
    }));

    return medicines.map((medicine, index) => {
      const itemMovements = movementByMedicine.get(String(medicine._id)) ?? [];
      const receivedQuantity = itemMovements
        .filter((item) => item.type === "received" || item.type === "initial_stock")
        .reduce((sum, item) => sum + Math.max(0, item.quantityChange), 0);
      const dispensedQuantity = itemMovements
        .filter((item) => item.type === "dispensed")
        .reduce((sum, item) => sum + Math.abs(item.quantityChange), 0);
      const adjustmentQuantity = itemMovements
        .filter((item) => item.type === "adjustment")
        .reduce((sum, item) => sum + item.quantityChange, 0);
      const damagedLostExpiredQuantity = itemMovements
        .filter((item) => item.type === "damaged" || item.type === "lost" || item.type === "expired")
        .reduce((sum, item) => sum + Math.abs(item.quantityChange), 0);
      const beginningBalance = priorBalances[index] ?? 0;
      const calculatedEndingBalance = Math.max(
        0,
        beginningBalance + receivedQuantity - dispensedQuantity + adjustmentQuantity - damagedLostExpiredQuantity,
      );
      const status = computeStatus(medicine);
      const item: IMonthlyInventoryItem = {
        medicineId: medicine._id,
        medicineName: medicine.name,
        unit: medicine.unit,
        beginningBalance,
        receivedQuantity,
        dispensedQuantity,
        adjustmentQuantity,
        damagedLostExpiredQuantity,
        calculatedEndingBalance,
        batches: batches
          .filter((batch) => String(batch.medicineId) === String(medicine._id))
          .map((batch) => ({
            batchNumber: batch.batchNumber,
            ...(batch.expiryDate ? { expirationDate: batch.expiryDate } : {}),
          })),
        availabilityStatus: status,
        lowStockThreshold: medicine.lowStockThreshold,
        isLowStock: calculatedEndingBalance <= medicine.lowStockThreshold,
        reorderRequired: calculatedEndingBalance <= medicine.lowStockThreshold,
      };
      if (medicine.category) item.category = medicine.category;
      return item;
    });
  }

  async openDraft(year: number, month: number, preparedBy: string): Promise<IMonthlyInventoryReport> {
    validatePeriod(year, month);
    const finalized = await MonthlyInventoryReport.findOne({ year, month, status: "finalized" });
    if (finalized) return finalized;
    const calculated = await this.calculateItems(year, month);
    const existing = await MonthlyInventoryReport.findOne({ year, month, status: "draft" });
    if (!existing) {
      return MonthlyInventoryReport.create({ year, month, status: "draft", items: calculated, preparedBy });
    }
    const reconciliation = new Map(existing.items.map((item) => [String(item.medicineId), item]));
    existing.items = calculated.map((item) => {
      const saved = reconciliation.get(String(item.medicineId));
      if (saved?.physicalCount === undefined) return item;
      return {
        ...item,
        physicalCount: saved.physicalCount,
        variance: saved.physicalCount - item.calculatedEndingBalance,
        ...(saved.varianceNotes ? { varianceNotes: saved.varianceNotes } : {}),
      };
    }) as typeof existing.items;
    await existing.save();
    return existing;
  }

  async saveDraft(id: string, inputs: ReconciliationInput[]): Promise<IMonthlyInventoryReport> {
    const report = await MonthlyInventoryReport.findById(id);
    if (!report) throw new AppError("Monthly inventory report not found", 404);
    if (report.status !== "draft") throw new AppError("Finalized monthly inventory reports are read-only", 409);
    const byMedicine = new Map(inputs.map((item) => [item.medicineId, item]));
    for (const item of report.items) {
      const input = byMedicine.get(String(item.medicineId));
      if (!input) continue;
      if (!Number.isInteger(input.physicalCount) || input.physicalCount < 0) {
        throw new AppError("Physical stock counts must be non-negative whole numbers", 400);
      }
      item.physicalCount = input.physicalCount;
      item.variance = input.physicalCount - item.calculatedEndingBalance;
      const notes = input.varianceNotes?.trim();
      if (notes) item.varianceNotes = notes;
      else delete item.varianceNotes;
    }
    await report.save();
    return report;
  }

  async finalize(id: string, finalizedBy: string): Promise<IMonthlyInventoryReport> {
    const current = await MonthlyInventoryReport.findById(id);
    if (!current) throw new AppError("Monthly inventory report not found", 404);
    if (current.status !== "draft") throw new AppError("Monthly inventory report is already finalized", 409);
    const latestCalculations = await this.calculateItems(current.year, current.month);
    return withMongoTransaction(async (session) => {
      const query = MonthlyInventoryReport.findById(id);
      if (session) query.session(session);
      const report = await query;
      if (!report) throw new AppError("Monthly inventory report not found", 404);
      if (report.status !== "draft") throw new AppError("Monthly inventory report is already finalized", 409);
      const inputs = new Map(report.items.map((item) => [String(item.medicineId), {
        physicalCount: item.physicalCount,
        varianceNotes: item.varianceNotes,
      }]));
      report.items = latestCalculations.map((item) => {
        const input = inputs.get(String(item.medicineId));
        if (input?.physicalCount === undefined) return item;
        return {
          ...item,
          physicalCount: input.physicalCount,
          variance: input.physicalCount - item.calculatedEndingBalance,
          ...(input.varianceNotes ? { varianceNotes: input.varianceNotes } : {}),
        };
      }) as typeof report.items;
      for (const item of report.items) {
        if (item.physicalCount === undefined) {
          throw new AppError(`Physical count is required for ${item.medicineName}`, 400);
        }
        item.variance = item.physicalCount - item.calculatedEndingBalance;
        if (item.variance !== 0 && !item.varianceNotes?.trim()) {
          throw new AppError(`An explanation is required for the ${item.medicineName} variance`, 400);
        }
      }
      report.status = "finalized";
      report.finalizedBy = new mongoose.Types.ObjectId(finalizedBy);
      report.finalizedAt = new Date();
      await report.save(session ? { session } : {});
      return report;
    });
  }

  async list(role: string): Promise<IMonthlyInventoryReport[]> {
    return MonthlyInventoryReport.find(role === "nurse" ? {} : { status: "finalized" })
      .populate("preparedBy finalizedBy", "name role")
      .sort({ year: -1, month: -1 });
  }

  async getById(id: string, role: string): Promise<IMonthlyInventoryReport> {
    const report = await MonthlyInventoryReport.findById(id).populate("preparedBy finalizedBy", "name role");
    if (!report) throw new AppError("Monthly inventory report not found", 404);
    if (role !== "nurse" && report.status !== "finalized") throw new AppError("Access denied", 403);
    return report;
  }
}
