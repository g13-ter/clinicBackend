import { Types } from "mongoose";
import MedicalHistory, { type IMedicalHistory } from "../models/medicalHistory.model";
import Medicine, { type IMedicine } from "../models/medicine.model";
import InventoryBatch from "../models/inventoryBatch.model";
import MedicineDispense from "../models/medicineDispense.model";
import StockMovement from "../models/stockMovement.model";
import { AppError } from "../middleware/error.middleware";
import { assertInventoryPeriodOpen } from "./monthlyInventory.service";
import { withMongoTransaction } from "../utils/transaction";

export interface DispensingStockChange {
  medicine: IMedicine;
  previousQuantity: number;
}

const CLAIM_TIMEOUT_MS = 15 * 60_000;

export class MedicationDispensingService {
  async listOpenOrders(): Promise<IMedicalHistory[]> {
    const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS);
    await MedicalHistory.updateMany(
      { medicationStatus: "accepted", medicationClaimedAt: { $lt: staleBefore } },
      { $set: { medicationStatus: "pending" }, $unset: { medicationClaimedBy: 1, medicationClaimedAt: 1 } },
    );
    return MedicalHistory.find({ medicationStatus: { $in: ["pending", "accepted"] } })
      .populate("patientId", "studentId firstName lastName medicalAlerts course yearLevel")
      .populate("recordedBy", "name role")
      .populate("medicationClaimedBy", "name role")
      .sort({ dateRecorded: 1 });
  }

  async listRecentAdministered(): Promise<IMedicalHistory[]> {
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    return MedicalHistory.find({
      medicationStatus: "dispensed",
      medicationDispensedAt: { $gte: since },
    })
      .populate("patientId", "studentId firstName lastName medicalAlerts course yearLevel")
      .populate("recordedBy", "name role")
      .populate("medicationDispensedBy", "name role")
      .sort({ medicationDispensedAt: -1 });
  }

  async claim(medicalHistoryId: string, nurseId: string): Promise<IMedicalHistory> {
    const existing = await MedicalHistory.findById(medicalHistoryId);
    if (!existing) throw new AppError("Medication request not found", 404);
    if (existing.medicationStatus === "accepted" && String(existing.medicationClaimedBy) === nurseId) {
      return existing;
    }
    const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS);
    const claimed = await MedicalHistory.findOneAndUpdate(
      {
        _id: medicalHistoryId,
        $or: [
          { medicationStatus: "pending" },
          { medicationStatus: "accepted", medicationClaimedAt: { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          medicationStatus: "accepted",
          medicationClaimedBy: new Types.ObjectId(nurseId),
          medicationClaimedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
    if (!claimed) throw new AppError("Another nurse is already handling this medication request", 409);
    return claimed;
  }

  async dispense(
    medicalHistoryId: string,
    nurseId: string,
    data: { administrationNotes?: string },
  ): Promise<{ history: IMedicalHistory; stockChanges: DispensingStockChange[] }> {
    await assertInventoryPeriodOpen(new Date());

    try {
      return await withMongoTransaction(async (session) => {
        const claimed = await MedicalHistory.findOneAndUpdate(
          {
            _id: medicalHistoryId,
            medicationStatus: "accepted",
            medicationClaimedBy: new Types.ObjectId(nurseId),
            "prescribedItems.0": { $exists: true },
          },
          { $set: { medicationStatus: "dispensing" } },
          { returnDocument: "after", ...(session ? { session } : {}) },
        );
        if (!claimed) {
          const existing = await MedicalHistory.findById(medicalHistoryId).session(session ?? null);
          if (!existing) throw new AppError("Medication request not found", 404);
          if (existing.medicationStatus === "dispensed") {
            throw new AppError("This medication request has already been dispensed", 409);
          }
          if (!existing.prescribedItems?.length) {
            throw new AppError("This consultation has no inventory medication to dispense", 409);
          }
          throw new AppError("Accept this medication request before confirming administration", 409);
        }

        const stockChanges: DispensingStockChange[] = [];
        const dispenseRecords: Array<Record<string, unknown>> = [];
        const movementRecords: Array<Record<string, unknown>> = [];

        for (const item of claimed.prescribedItems ?? []) {
          const medicineQuery = Medicine.findById(item.medicineId);
          if (session) medicineQuery.session(session);
          const medicine = await medicineQuery;
          if (!medicine || !medicine.isActive) {
            throw new AppError(`Medicine "${item.medicineName}" is no longer available`, 409);
          }

          const batchQuery = InventoryBatch.find({
            medicineId: medicine._id,
            quantityRemaining: { $gt: 0 },
          }).sort({ expiryDate: 1, receivedAt: 1 });
          if (session) batchQuery.session(session);
          const batches = await batchQuery;
          const totalBatchQuantity = batches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
          const now = new Date();
          const legacyQuantity = medicine.expiryDate && medicine.expiryDate < now
            ? 0
            : Math.max(0, medicine.quantity - totalBatchQuantity);
          const eligibleBatches = batches.filter(
            (batch) => !batch.expiryDate || batch.expiryDate >= now,
          );
          const dispensableQuantity =
            legacyQuantity + eligibleBatches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
          if (dispensableQuantity < item.quantity) {
            throw new AppError(
              `Insufficient unexpired stock for "${medicine.name}": ${item.quantity} requested, only ${dispensableQuantity} ${medicine.unit} available`,
              409,
            );
          }

          let remaining = item.quantity;
          const allocations: Array<{ batchId: unknown; batchNumber: string; quantity: number }> = [];
          for (const batch of eligibleBatches) {
            if (remaining <= 0) break;
            const quantity = Math.min(batch.quantityRemaining, remaining);
            if (quantity <= 0) continue;
            const result = await InventoryBatch.updateOne(
              { _id: batch._id, quantityRemaining: { $gte: quantity } },
              { $inc: { quantityRemaining: -quantity } },
              session ? { session } : {},
            );
            if (result.modifiedCount !== 1) {
              throw new AppError(`Stock batch "${batch.batchNumber}" changed. Please try again.`, 409);
            }
            allocations.push({ batchId: batch._id, batchNumber: batch.batchNumber, quantity });
            remaining -= quantity;
          }

          const previousQuantity = medicine.quantity;
          const updated = await Medicine.findOneAndUpdate(
            { _id: medicine._id, quantity: { $gte: item.quantity } },
            { $inc: { quantity: -item.quantity } },
            { returnDocument: "after", ...(session ? { session } : {}) },
          );
          if (!updated) {
            throw new AppError(`Stock for "${medicine.name}" changed. Please try again.`, 409);
          }
          stockChanges.push({ medicine: updated, previousQuantity });

          dispenseRecords.push({
            ...(claimed.visitId ? { visitId: claimed.visitId } : {}),
            medicalHistoryId: claimed._id,
            medicineId: item.medicineId,
            quantity: item.quantity,
            unit: item.unit,
            ...(item.instructions ? { instructions: item.instructions } : {}),
            batchAllocations: allocations,
            dispensedBy: new Types.ObjectId(nurseId),
          });
          movementRecords.push({
            medicineId: item.medicineId,
            ...(claimed.visitId ? { visitId: claimed.visitId } : {}),
            type: "dispensed",
            quantityChange: -item.quantity,
            balanceAfter: updated.quantity,
            occurredAt: new Date(),
            performedBy: new Types.ObjectId(nurseId),
            notes: "Dispensed by nurse from a physician prescription",
          });
        }

        await MedicineDispense.insertMany(dispenseRecords, session ? { session } : {});
        await StockMovement.insertMany(movementRecords, session ? { session } : {});

        const history = await MedicalHistory.findOneAndUpdate(
          { _id: claimed._id, medicationStatus: "dispensing" },
          {
            $set: {
              medicationStatus: "dispensed",
              medicationDispensedBy: new Types.ObjectId(nurseId),
              medicationDispensedAt: new Date(),
              ...(data.administrationNotes ? { medicationAdministrationNotes: data.administrationNotes } : {}),
            },
          },
          { returnDocument: "after", ...(session ? { session } : {}) },
        );
        if (!history) throw new AppError("Medication request changed. Refresh and try again.", 409);
        return { history, stockChanges };
      });
    } catch (error) {
      await MedicalHistory.updateOne(
        { _id: medicalHistoryId, medicationStatus: "dispensing" },
        { $set: { medicationStatus: "accepted" } },
      ).catch(() => undefined);
      throw error;
    }
  }

  async markNotGiven(
    medicalHistoryId: string,
    nurseId: string,
    data: { reason: string; notes: string },
  ): Promise<IMedicalHistory> {
    const history = await MedicalHistory.findOneAndUpdate(
      {
        _id: medicalHistoryId,
        medicationStatus: "accepted",
        medicationClaimedBy: new Types.ObjectId(nurseId),
      },
      {
        $set: {
          medicationStatus: "not_given",
          medicationNotGivenReason: data.reason,
          medicationNotGivenNotes: data.notes,
        },
      },
      { returnDocument: "after" },
    );
    if (!history) throw new AppError("Accept this medication request before marking it not given", 409);
    return history;
  }

  async reportAdverseReaction(
    medicalHistoryId: string,
    nurseId: string,
    details: string,
  ): Promise<IMedicalHistory> {
    const history = await MedicalHistory.findOneAndUpdate(
      { _id: medicalHistoryId, medicationStatus: "dispensed" },
      {
        $set: {
          medicationAdverseReaction: details,
          medicationAdverseReactionAt: new Date(),
          medicationAdverseReactionReportedBy: new Types.ObjectId(nurseId),
        },
      },
      { returnDocument: "after" },
    );
    if (!history) throw new AppError("Only an administered medication can have an adverse reaction report", 409);
    return history;
  }
}
