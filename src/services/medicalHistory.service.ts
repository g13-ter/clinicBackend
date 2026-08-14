import MedicalHistory, { IMedicalHistory, IPrescribedItem } from "../models/medicalHistory.model";
import Medicine from "../models/medicine.model";
import ClinicVisit from "../models/clinicVisit.model";
import Appointment from "../models/appointment.model";
import InventoryBatch from "../models/inventoryBatch.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { withMongoTransaction } from "../utils/transaction";
import Patient from "../models/patient.model";

export class MedicalHistoryService {
  async createMedicalHistory(
    data: Partial<IMedicalHistory> & { prescribedItems?: { medicineId: string; quantity: number; instructions?: string; route?: string; scheduledTime?: string }[] },
    context: {
      providerRole?: "doctor" | "nurse";
      closureOutcome?: "returned_to_class" | "sent_home" | "guardian_pickup";
    } = {},
  ): Promise<{ entry: IMedicalHistory }> {
    try {
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
          if (context.providerRole !== "nurse" && !sourceVisit.readyForDoctor && !sourceVisit.isEmergency) {
            throw new AppError(
              "A nurse must complete triage before a physician consultation can be saved",
              409,
            );
          }
          if (
            context.providerRole !== "nurse" &&
            sourceVisit.assignedDoctorId &&
            String(sourceVisit.assignedDoctorId) !== String(data.recordedBy)
          ) {
            throw new AppError("This visit is assigned to another doctor", 403);
          }
        }

        const requestedItems = data.prescribedItems ?? [];
        const snapshotItems: IPrescribedItem[] = [];
        const requestedQuantityByMedicine = requestedItems.reduce((totals, item) => {
          const medicineId = String(item.medicineId);
          totals.set(medicineId, (totals.get(medicineId) ?? 0) + item.quantity);
          return totals;
        }, new Map<string, number>());

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
          });
          if (session) batchQuery.session(session);
          const batches = await batchQuery;
          const now = new Date();
          const totalBatchQuantity = batches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
          const legacyQuantity = pair.medicine.expiryDate && pair.medicine.expiryDate < now
            ? 0
            : Math.max(0, pair.medicine.quantity - totalBatchQuantity);
          const dispensableQuantity = legacyQuantity + batches
            .filter((batch) => !batch.expiryDate || batch.expiryDate >= now)
            .reduce((sum, batch) => sum + batch.quantityRemaining, 0);
          const reservationQuery = MedicalHistory.find({
            medicationStatus: { $in: ["pending", "accepted", "dispensing"] },
            "prescribedItems.medicineId": pair.medicine._id,
          }).select("prescribedItems");
          if (session) reservationQuery.session(session);
          const reservedQuantity = (await reservationQuery).reduce(
            (sum, history) => sum + (history.prescribedItems ?? [])
              .filter((item) => String(item.medicineId) === String(pair.medicine!._id))
              .reduce((itemSum, item) => itemSum + item.quantity, 0),
            0,
          );
          const availableAfterReservations = Math.max(0, dispensableQuantity - reservedQuantity);
          const totalRequested = requestedQuantityByMedicine.get(String(pair.requested.medicineId)) ?? pair.requested.quantity;
          if (availableAfterReservations < totalRequested) {
            throw new AppError(
              `Insufficient unreserved stock for "${pair.medicine.name}": ${totalRequested} requested, only ${availableAfterReservations} ${pair.medicine.unit} available`,
              400,
            );
          }
          snapshotItems.push({
            medicineId: pair.medicine._id,
            medicineName: pair.medicine.name,
            quantity: pair.requested.quantity,
            unit: pair.medicine.unit,
            ...(pair.requested.instructions ? { instructions: pair.requested.instructions } : {}),
            ...(pair.requested.route ? { route: pair.requested.route } : {}),
            ...(pair.requested.scheduledTime ? { scheduledTime: pair.requested.scheduledTime } : {}),
          });
        }

        const [entry] = await MedicalHistory.create(
          [{
            ...data,
            ...(snapshotItems.length > 0 ? { prescribedItems: snapshotItems } : {}),
            ...(snapshotItems.length > 0 ? { medicationStatus: "pending" } : {}),
          }],
          session ? { session } : {},
        );
        if (!entry) throw new Error("Medical history entry was not created");

        if (data.visitId) {
          const completedVisit = await ClinicVisit.findOneAndUpdate(
            { _id: data.visitId, patientId: data.patientId! },
            {
              status: "completed",
              closureOutcome: context.providerRole === "nurse"
                ? context.closureOutcome ?? "returned_to_class"
                : "physician_consultation",
              closedAt: new Date(),
              updatedBy: data.recordedBy,
            },
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

        return { entry };
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
        .populate("medicationDispensedBy", "name role")
        .populate("medicationClaimedBy", "name role")
        .populate("medicationAdverseReactionReportedBy", "name role")
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
      .populate("updatedBy", "name role")
      .populate("medicationDispensedBy", "name role")
      .populate("medicationClaimedBy", "name role")
      .populate("medicationAdverseReactionReportedBy", "name role");

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
