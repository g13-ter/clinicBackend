import MedicalHistory, { IMedicalHistory, IPrescribedItem } from "../models/medicalHistory.model";
import Medicine, { IMedicine } from "../models/medicine.model";
import ClinicVisit from "../models/clinicVisit.model";
import MedicineDispense from "../models/medicineDispense.model";
import Appointment from "../models/appointment.model";
import InventoryBatch from "../models/inventoryBatch.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { withMongoTransaction } from "../utils/transaction";
import StockMovement from "../models/stockMovement.model";
import { assertInventoryPeriodOpen } from "./monthlyInventory.service";
import Patient from "../models/patient.model";

export interface StockChange {
  medicine: IMedicine;
  previousQuantity: number;
}

export class MedicalHistoryService {
  async createMedicalHistory(
    data: Partial<IMedicalHistory> & { prescribedItems?: { medicineId: string; quantity: number; instructions?: string }[] }
  ): Promise<{ entry: IMedicalHistory; stockChanges: StockChange[] }> {
    try {
      if ((data.prescribedItems?.length ?? 0) > 0) {
        await assertInventoryPeriodOpen(new Date());
      }
      return await withMongoTransaction(async (session) => {
        const patientQuery = Patient.findById(data.patientId);
        if (session) patientQuery.session(session);
        const patient = await patientQuery;
        if (!patient) throw new AppError("Patient not found", 404);
        if (data.visitId) {
          const existingQuery = MedicalHistory.findOne({ visitId: data.visitId });
          if (session) existingQuery.session(session);
          if (await existingQuery) {
            throw new AppError("This consultation has already been saved", 409);
          }

          const visitQuery = ClinicVisit.findById(data.visitId);
          if (session) visitQuery.session(session);
          const sourceVisit = await visitQuery;
          if (!sourceVisit) {
            throw new AppError("Clinic visit not found for this consultation", 404);
          }
          if (!sourceVisit.readyForDoctor && !sourceVisit.isEmergency) {
            throw new AppError(
              "A nurse must complete triage before a physician consultation can be saved",
              409,
            );
          }
          if (
            sourceVisit.assignedDoctorId &&
            String(sourceVisit.assignedDoctorId) !== String(data.recordedBy)
          ) {
            throw new AppError("This visit is assigned to another doctor", 403);
          }
        }

        const requestedItems = data.prescribedItems ?? [];
        const stockChanges: StockChange[] = [];
        const snapshotItems: IPrescribedItem[] = [];
        const batchAllocationsByMedicine = new Map<string, {
          batchId: InstanceType<typeof InventoryBatch>["_id"];
          batchNumber: string;
          quantity: number;
        }[]>();

        const medicinePairs = await Promise.all(
          requestedItems.map(async (item) => {
            const query = Medicine.findById(item.medicineId);
            if (session) query.session(session);
            return { requested: item, medicine: await query };
          }),
        );

        for (const pair of medicinePairs) {
          if (!pair.medicine) {
            throw new AppError(`Medicine not found: ${pair.requested.medicineId}`, 404);
          }
          if (!pair.medicine.isActive) {
            throw new AppError(`Medicine "${pair.medicine.name}" has been discontinued`, 409);
          }
          const batchQuery = InventoryBatch.find({
            medicineId: pair.medicine._id,
            quantityRemaining: { $gt: 0 },
          }).sort({ expiryDate: 1, receivedAt: 1 });
          if (session) batchQuery.session(session);
          const batches = await batchQuery;
          const totalBatchQuantity = batches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
          const now = new Date();
          const legacyQuantity = pair.medicine.expiryDate && pair.medicine.expiryDate < now
            ? 0
            : Math.max(0, pair.medicine.quantity - totalBatchQuantity);
          const eligibleBatches = batches.filter(
            (batch) => !batch.expiryDate || batch.expiryDate >= now,
          );
          const dispensableQuantity =
            legacyQuantity + eligibleBatches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
          if (dispensableQuantity < pair.requested.quantity) {
            throw new AppError(
              `Insufficient unexpired stock for "${pair.medicine.name}": ${pair.requested.quantity} requested, only ${dispensableQuantity} ${pair.medicine.unit} available`,
              400,
            );
          }

          let remaining = pair.requested.quantity;
          const allocations: { batchId: InstanceType<typeof InventoryBatch>["_id"]; batchNumber: string; quantity: number }[] = [];
          for (const batch of eligibleBatches) {
            if (remaining <= 0) break;
            const quantity = Math.min(batch.quantityRemaining, remaining);
            if (quantity <= 0) continue;
            const updatedBatch = await InventoryBatch.updateOne(
              { _id: batch._id, quantityRemaining: { $gte: quantity } },
              { $inc: { quantityRemaining: -quantity } },
              session ? { session } : {},
            );
            if (updatedBatch.modifiedCount !== 1) {
              throw new AppError(`Stock batch "${batch.batchNumber}" changed. Please try again.`, 409);
            }
            allocations.push({ batchId: batch._id, batchNumber: batch.batchNumber, quantity });
            remaining -= quantity;
          }
          batchAllocationsByMedicine.set(String(pair.medicine._id), allocations);
        }

        for (const pair of medicinePairs) {
          const medicineBefore = pair.medicine as IMedicine;
          const updated = await Medicine.findOneAndUpdate(
            { _id: pair.requested.medicineId, quantity: { $gte: pair.requested.quantity } },
            { $inc: { quantity: -pair.requested.quantity } },
            { returnDocument: "after", ...(session ? { session } : {}) },
          );
          if (!updated) {
            throw new AppError(
              `Stock for "${medicineBefore.name}" changed before this prescription could be completed. Please try again.`,
              409,
            );
          }

          stockChanges.push({ medicine: updated, previousQuantity: medicineBefore.quantity });
          snapshotItems.push({
            medicineId: updated._id,
            medicineName: medicineBefore.name,
            quantity: pair.requested.quantity,
            unit: medicineBefore.unit,
            ...(pair.requested.instructions ? { instructions: pair.requested.instructions } : {}),
          });
        }

        const [entry] = await MedicalHistory.create(
          [{
            ...data,
            ...(snapshotItems.length > 0 ? { prescribedItems: snapshotItems } : {}),
          }],
          session ? { session } : {},
        );
        if (!entry) throw new Error("Medical history entry was not created");

        if (data.visitId) {
          if (snapshotItems.length > 0) {
            await MedicineDispense.insertMany(
              snapshotItems.map((item) => ({
                visitId: data.visitId,
                medicineId: item.medicineId,
                quantity: item.quantity,
                unit: item.unit,
                ...(item.instructions ? { instructions: item.instructions } : {}),
                batchAllocations: batchAllocationsByMedicine.get(String(item.medicineId)) ?? [],
                dispensedBy: data.recordedBy,
              })),
              session ? { session } : {},
            );
            await StockMovement.insertMany(
              stockChanges.map((change) => ({
                medicineId: change.medicine._id,
                visitId: data.visitId,
                type: "dispensed",
                quantityChange: change.medicine.quantity - change.previousQuantity,
                balanceAfter: change.medicine.quantity,
                occurredAt: new Date(),
                performedBy: data.recordedBy,
                notes: "Dispensed during physician consultation",
              })),
              session ? { session } : {},
            );
          }

          const completedVisit = await ClinicVisit.findOneAndUpdate(
            { _id: data.visitId, patientId: data.patientId! },
            { status: "completed", closureOutcome: "physician_consultation", closedAt: new Date(), updatedBy: data.recordedBy },
            { returnDocument: "after", ...(session ? { session } : {}) },
          );
          if (!completedVisit) throw new AppError("Clinic visit not found for this student", 409);

          if (completedVisit.appointmentId) {
            await Appointment.findByIdAndUpdate(
              completedVisit.appointmentId,
              { status: "completed", updatedBy: data.recordedBy },
              session ? { session } : {},
            );
          }
        }

        return { entry, stockChanges };
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000 &&
        data.visitId
      ) {
        throw new AppError("This consultation has already been saved", 409);
      }
      throw error;
    }
  }

  async getHistoryByPatient(
    patientId: string,
    { limit, skip }: PaginationParams,
    doctorId?: string,
  ): Promise<{ history: IMedicalHistory[]; total: number }> {
    if (!patientId) {
      throw new AppError("Patient ID is required", 400);
    }

    const hasCurrentAssignment = doctorId
      ? Boolean(await ClinicVisit.exists({
          patientId,
          assignedDoctorId: doctorId,
          isActive: true,
          status: { $in: ["ready_for_doctor", "in_consultation", "paused"] },
        })) || Boolean(await Appointment.exists({
          patientId,
          doctorId,
          status: { $in: ["pending", "confirmed", "checked_in"] },
        }))
      : true;
    const filter = {
      patientId,
      ...(doctorId && !hasCurrentAssignment ? { recordedBy: doctorId } : {}),
    };

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

  async getHistoryById(id: string, doctorId?: string): Promise<IMedicalHistory> {
    const entry = await MedicalHistory.findById(id)
      .populate("patientId")
      .populate("visitId", "visitDate complaint")
      .populate("recordedBy", "name role")
      .populate("updatedBy", "name role");

    if (!entry) {
      throw new AppError("Medical history entry not found", 404);
    }

    if (doctorId) {
      const recorder = entry.recordedBy as unknown as { _id?: unknown } | undefined;
      const patient = entry.patientId as unknown as { _id?: unknown };
      const patientId = String(patient?._id ?? entry.patientId);
      const ownsEntry = String(recorder?._id ?? entry.recordedBy) === doctorId;
      const currentlyAssigned = await ClinicVisit.exists({
        patientId,
        assignedDoctorId: doctorId,
        isActive: true,
        status: { $in: ["ready_for_doctor", "in_consultation", "paused"] },
      });
      if (!ownsEntry && !currentlyAssigned) {
        throw new AppError("You do not have an active care assignment for this record", 403);
      }
    }

    return entry;
  }

  async updateMedicalHistory(id: string, data: Partial<IMedicalHistory>, doctorId: string): Promise<{ before: IMedicalHistory; after: IMedicalHistory }> {
    const before = await MedicalHistory.findOne({ _id: id, recordedBy: doctorId });

    if (!before) {
      throw new AppError("You can only update medical history entries you recorded", 403);
    }

    const after = await MedicalHistory.findOneAndUpdate({ _id: id, recordedBy: doctorId }, data, {
      returnDocument: "after",
      runValidators: true,
    });

    if (!after) {
      throw new AppError("Medical history entry not found", 404);
    }

    return { before, after };
  }
}
