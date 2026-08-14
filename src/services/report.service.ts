import ClinicVisit from "../models/clinicVisit.model";
import Medicine, { IMedicine } from "../models/medicine.model";
import Appointment from "../models/appointment.model";
import MedicalHistory from "../models/medicalHistory.model";
import PurchaseRequest from "../models/purchaseRequest.model";
import MedicineDispense from "../models/medicineDispense.model";
import InventoryBatch from "../models/inventoryBatch.model";
import Patient from "../models/patient.model";
import SystemSettings from "../models/systemSettings.model";
import { AppError } from "../middleware/error.middleware";
import { clinicDayRange } from "../utils/clinicTime";
import StockMovement from "../models/stockMovement.model";

interface PopulatedPatientRef {
  gender?: string;
  patientType?: PatientType;
}

export type PatientType = "student" | "teacher" | "staff";
export type ReportPatientType = PatientType | "employees";

export interface GenderBreakdown {
  male: number;
  female: number;
  total: number;
}

export interface ComplaintCount {
  complaint: string;
  count: number;
}

export interface MedicineStockRow {
  name: string;
  remainingStock: number;
  unit: string;
  isLowStock: boolean;
}

export interface AppointmentBreakdown {
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  completed: number;
}

export interface ReportStats {
  periodStart: Date;
  periodEnd: Date;

  // Student visits by gender; staff attendance is not tracked.
  studentAttendance: GenderBreakdown;
  uniqueStudentsServed: number;
  patientTypeFilter: ReportPatientType | undefined;
  attendanceByPatientType: Record<PatientType, GenderBreakdown>;

  // Free-text complaints sorted by frequency.
  complaintCounts: ComplaintCount[];
  complaintCountsByPatientType: Record<PatientType, ComplaintCount[]>;

  // Current stock only; historical usage is not tracked.
  medicineStock: MedicineStockRow[];

  // Section VIII - Issues and Concerns
  lowStockMedicines: MedicineStockRow[];

  // Current status of appointments booked during the period.
  appointmentStats: AppointmentBreakdown;

  physicianMedicalRecordsCount: number;
  nursingAssessmentsCount: number;
  referralCount: number;
  emergencyCount: number;
  referrals: { facility: string; reason: string; outcome?: string }[];
  hasTestData: boolean;

  // Current pending purchase requests, not period-filtered.
  pendingPurchaseRequestsCount: number;
}

export interface InventoryExportRow {
  name: string;
  inventorySection: string;
  category: string;
  quantity: number;
  unit: string;
  lowStockThreshold: number;
  expiryDate: Date | null;
  status: string;
}

export interface MedicineUsageExportRow {
  name: string;
  inventorySection: string;
  unit: string;
  quantityDispensed: number;
  dispenseCount: number;
}

export interface MedicationInventoryReportRow {
  name: string;
  inventorySection: string;
  dateReceived: Date | null;
  totalPrescribed: number;
  remainingStock: number;
  unit: string;
  expirationDate: Date | null;
  remarks: string;
}

export interface AnnualMedicationMonth {
  key: string;
  label: string;
  year: number;
}

export interface AnnualMedicationRow {
  category: string;
  name: string;
  unit: string;
  monthlyConsumed: number[];
  totalConsumed: number;
  remainingStock: number;
}

export interface AnnualMedicationReport {
  schoolYear: string;
  campus: string;
  months: AnnualMedicationMonth[];
  rows: AnnualMedicationRow[];
}

export interface CurrentStockBatchRow {
  medicine: string;
  inventorySection: string;
  category: string;
  batchNumber: string;
  quantityRemaining: number;
  totalMedicineStock: number;
  unit: string;
  supplier: string;
  receivedAt: Date | null;
  expiryDate: Date | null;
  status: string;
}

export interface StockMovementExportRow {
  occurredAt: Date;
  medicine: string;
  type: string;
  quantityChange: number;
  balanceAfter: number;
  unit: string;
  batchNumber: string;
  performedBy: string;
  notes: string;
}

export interface ReorderExportRow {
  medicine: string;
  inventorySection: string;
  category: string;
  currentStock: number;
  unit: string;
  reorderThreshold: number;
  pendingOrderQuantity: number;
  suggestedOrderQuantity: number;
  status: string;
}

export interface MedicationUsageDetailRow {
  dispensedAt: Date;
  studentId: string;
  studentName: string;
  patientType: PatientType;
  complaint: string;
  medicine: string;
  quantity: number;
  unit: string;
  instructions: string;
  recordedBy: string;
}

export interface VaccinationExportRow {
  studentId: string;
  studentName: string;
  patientType: PatientType;
  vaccine: string;
  dateAdministered: Date | null;
  notes: string;
}

export class ReportService {
  async getClinicSummary(startDate: Date, endDate: Date, patientType?: ReportPatientType): Promise<ReportStats> {
    if (startDate > endDate) {
      throw new AppError("startDate must be before endDate", 400);
    }

    const patientTypeQuery: Record<string, unknown> = patientType === "student"
      ? { $or: [{ patientType: "student" }, { patientType: { $exists: false } }] }
      : patientType === "employees" ? { patientType: { $in: ["teacher", "staff"] } }
      : patientType ? { patientType } : {};
    const patientIds = patientType ? await Patient.find(patientTypeQuery).distinct("_id") : undefined;
    const patientFilter = patientIds ? { patientId: { $in: patientIds } } : {};
    const visitDateFilter = { visitDate: { $gte: startDate, $lte: endDate }, isActive: true, ...patientFilter };
    const appointmentDateFilter = { appointmentDate: { $gte: startDate, $lte: endDate }, ...patientFilter };
    const consultationDateFilter = { dateRecorded: { $gte: startDate, $lte: endDate }, ...patientFilter };

    const [visitsInPeriod, allMedicines, appointmentsInPeriod, physicianMedicalRecordsCount, pendingPurchaseRequestsCount] =
      await Promise.all([
        ClinicVisit.find(visitDateFilter)
          .populate("patientId", "gender patientType")
          .select("complaint patientId nursingAssessment isEmergency status referralFacility referralReason referralOutcome"),

        Medicine.find().select("name quantity unit lowStockThreshold"),

        Appointment.find(appointmentDateFilter).select("status"),

        MedicalHistory.countDocuments(consultationDateFilter),

        // Current snapshot.
        PurchaseRequest.countDocuments({ status: "pending" }),
      ]);

    // Student attendance by gender
    let male = 0;
    let female = 0;

    for (const visit of visitsInPeriod) {
      const patient = visit.patientId as PopulatedPatientRef | null;
      if (patient?.gender === "Male") male++;
      else if (patient?.gender === "Female") female++;
      // Count unlinked visits in the total but not the gender split.
    }

    const studentAttendance: GenderBreakdown = {
      male,
      female,
      total: visitsInPeriod.length,
    };
    const attendanceByPatientType: Record<PatientType, GenderBreakdown> = {
      student: { male: 0, female: 0, total: 0 },
      teacher: { male: 0, female: 0, total: 0 },
      staff: { male: 0, female: 0, total: 0 },
    };
    for (const visit of visitsInPeriod) {
      const patient = visit.patientId as PopulatedPatientRef | null;
      const type = patient?.patientType ?? "student";
      attendanceByPatientType[type].total++;
      if (patient?.gender === "Male") attendanceByPatientType[type].male++;
      if (patient?.gender === "Female") attendanceByPatientType[type].female++;
    }
    const uniqueStudentsServed = new Set(visitsInPeriod.map((visit) => String(visit.patientId?._id ?? visit.patientId))).size;

    // Common complaints
    const complaintMap = new Map<string, number>();
    for (const visit of visitsInPeriod) {
      const key = visit.complaint?.trim() || "Unspecified";
      complaintMap.set(key, (complaintMap.get(key) || 0) + 1);
    }

    const complaintCounts: ComplaintCount[] = Array.from(complaintMap.entries())
      .map(([complaint, count]) => ({ complaint, count }))
      .sort((a, b) => b.count - a.count);
    const complaintMapsByType: Record<PatientType, Map<string, number>> = {
      student: new Map(), teacher: new Map(), staff: new Map(),
    };
    for (const visit of visitsInPeriod) {
      const patient = visit.patientId as PopulatedPatientRef | null;
      const type = patient?.patientType ?? "student";
      const complaint = visit.complaint?.trim() || "Unspecified";
      const typeMap = complaintMapsByType[type];
      typeMap.set(complaint, (typeMap.get(complaint) ?? 0) + 1);
    }
    const complaintCountsByPatientType = Object.fromEntries(
      Object.entries(complaintMapsByType).map(([type, counts]) => [type,
        [...counts.entries()].map(([complaint, count]) => ({ complaint, count })).sort((a, b) => b.count - a.count),
      ]),
    ) as Record<PatientType, ComplaintCount[]>;

    // Current medicine stock
    const medicineStock: MedicineStockRow[] = allMedicines.map((med: IMedicine) => ({
      name: med.name,
      remainingStock: med.quantity,
      unit: med.unit,
      isLowStock: med.quantity <= med.lowStockThreshold,
    }));

    const lowStockMedicines = medicineStock.filter((med) => med.isLowStock);
    const nursingAssessmentsCount = visitsInPeriod.filter((visit) => Boolean(visit.nursingAssessment?.trim())).length;
    const referrals = visitsInPeriod
      .filter((visit) => visit.status === "referred")
      .map((visit) => ({
        facility: visit.referralFacility || "Facility not recorded",
        reason: visit.referralReason || "Reason not recorded",
        ...(visit.referralOutcome ? { outcome: visit.referralOutcome } : {}),
      }));
    const emergencyCount = visitsInPeriod.filter((visit) => visit.isEmergency).length;
    const hasTestData = visitsInPeriod.some((visit) => /\btest[_\s-]/i.test(visit.complaint || "")) ||
      allMedicines.some((medicine) => /\btest[_\s-]/i.test(medicine.name));

    // Appointments by current status
    const appointmentStats: AppointmentBreakdown = {
      total: appointmentsInPeriod.length,
      pending: appointmentsInPeriod.filter((a) => a.status === "pending").length,
      confirmed: appointmentsInPeriod.filter((a) => a.status === "confirmed").length,
      cancelled: appointmentsInPeriod.filter((a) => a.status === "cancelled").length,
      completed: appointmentsInPeriod.filter((a) => a.status === "completed").length,
    };

    return {
      periodStart: startDate,
      periodEnd: endDate,
      studentAttendance,
      patientTypeFilter: patientType,
      attendanceByPatientType,
      complaintCounts,
      complaintCountsByPatientType,
      medicineStock,
      lowStockMedicines,
      appointmentStats,
      uniqueStudentsServed,
      physicianMedicalRecordsCount,
      nursingAssessmentsCount,
      referralCount: referrals.length,
      emergencyCount,
      referrals,
      hasTestData,
      pendingPurchaseRequestsCount,
    };
  }

  async getInventoryExport(): Promise<InventoryExportRow[]> {
    const medicines = await Medicine.find()
      .select("name category inventorySection quantity unit lowStockThreshold expiryDate")
      .sort({ name: 1 })
      .lean();
    const now = new Date();

    return medicines.map((medicine) => {
      const expiryDate = medicine.expiryDate ?? null;
      const status = expiryDate && expiryDate < now
        ? "Expired"
        : medicine.quantity <= 0
          ? "Out of stock"
          : medicine.quantity <= medicine.lowStockThreshold
            ? "Low stock"
            : "In stock";

      return {
        name: medicine.name,
        inventorySection: medicine.inventorySection?.trim() || "Uncategorized",
        category: medicine.category ?? "",
        quantity: medicine.quantity,
        unit: medicine.unit,
        lowStockThreshold: medicine.lowStockThreshold,
        expiryDate,
        status,
      };
    });
  }

  async getCurrentStockByBatch(): Promise<CurrentStockBatchRow[]> {
    const [medicines, batches] = await Promise.all([
      Medicine.find()
        .select("name category inventorySection quantity unit expiryDate supplier dateReceived lowStockThreshold")
        .sort({ name: 1 })
        .lean(),
      InventoryBatch.find()
        .select("medicineId batchNumber quantityRemaining expiryDate supplier receivedAt")
        .sort({ receivedAt: 1 })
        .lean(),
    ]);
    const batchesByMedicine = new Map<string, typeof batches>();
    for (const batch of batches) {
      const key = String(batch.medicineId);
      const values = batchesByMedicine.get(key) ?? [];
      values.push(batch);
      batchesByMedicine.set(key, values);
    }

    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 86_400_000);
    const rows: CurrentStockBatchRow[] = [];
    for (const medicine of medicines) {
      const medicineBatches = batchesByMedicine.get(String(medicine._id)) ?? [];
      const batchedQuantity = medicineBatches.reduce(
        (sum, batch) => sum + batch.quantityRemaining,
        0,
      );
      const legacyQuantity = Math.max(0, medicine.quantity - batchedQuantity);
      const rowStatus = (quantity: number, expiryDate?: Date | null): string =>
        expiryDate && expiryDate < now
          ? "Expired"
          : quantity <= 0
            ? "Out of stock"
            : expiryDate && expiryDate <= soon
              ? "Expiring soon"
              : medicine.quantity <= medicine.lowStockThreshold
                ? "Low stock"
                : "In stock";

      if (legacyQuantity > 0 || medicineBatches.length === 0) {
        rows.push({
          medicine: medicine.name,
          inventorySection: medicine.inventorySection?.trim() || "Uncategorized",
          category: medicine.category ?? "",
          batchNumber: "Legacy / unbatched",
          quantityRemaining: legacyQuantity || medicine.quantity,
          totalMedicineStock: medicine.quantity,
          unit: medicine.unit,
          supplier: medicine.supplier ?? "",
          receivedAt: medicine.dateReceived ?? null,
          expiryDate: medicine.expiryDate ?? null,
          status: rowStatus(legacyQuantity || medicine.quantity, medicine.expiryDate),
        });
      }
      for (const batch of medicineBatches) {
        rows.push({
          medicine: medicine.name,
          inventorySection: medicine.inventorySection?.trim() || "Uncategorized",
          category: medicine.category ?? "",
          batchNumber: batch.batchNumber,
          quantityRemaining: batch.quantityRemaining,
          totalMedicineStock: medicine.quantity,
          unit: medicine.unit,
          supplier: batch.supplier ?? "",
          receivedAt: batch.receivedAt,
          expiryDate: batch.expiryDate ?? null,
          status: rowStatus(batch.quantityRemaining, batch.expiryDate),
        });
      }
    }
    return rows;
  }

  async getStockMovementExport(
    startDate: Date,
    endDate: Date,
  ): Promise<StockMovementExportRow[]> {
    const movements = await StockMovement.find({
      occurredAt: { $gte: startDate, $lte: endDate },
    })
      .populate("medicineId", "name unit")
      .populate("batchId", "batchNumber")
      .populate("performedBy", "name")
      .sort({ occurredAt: 1, createdAt: 1 })
      .lean();

    return movements.map((movement) => {
      const medicine = movement.medicineId as unknown as { name?: string; unit?: string } | null;
      const batch = movement.batchId as unknown as { batchNumber?: string } | null;
      const actor = movement.performedBy as unknown as { name?: string } | null;
      return {
        occurredAt: movement.occurredAt,
        medicine: medicine?.name ?? "Archived medicine",
        type: movement.type.replace(/_/g, " "),
        quantityChange: movement.quantityChange,
        balanceAfter: movement.balanceAfter,
        unit: medicine?.unit ?? "",
        batchNumber: batch?.batchNumber ?? "",
        performedBy: actor?.name ?? "Unknown user",
        notes: movement.notes ?? "",
      };
    });
  }

  async getReorderExport(): Promise<ReorderExportRow[]> {
    const [medicines, pendingOrders] = await Promise.all([
      Medicine.find()
        .select("name category inventorySection quantity unit lowStockThreshold")
        .sort({ name: 1 })
        .lean(),
      PurchaseRequest.aggregate<{ _id: unknown; quantity: number }>([
        {
          $match: {
            medicineId: { $exists: true },
            status: { $in: ["pending", "approved", "ordered"] },
          },
        },
        { $group: { _id: "$medicineId", quantity: { $sum: "$quantityRequested" } } },
      ]),
    ]);
    const pendingByMedicine = new Map(
      pendingOrders.map((entry) => [String(entry._id), entry.quantity]),
    );

    return medicines
      .filter((medicine) => medicine.quantity <= medicine.lowStockThreshold)
      .map((medicine) => {
        const pendingOrderQuantity = pendingByMedicine.get(String(medicine._id)) ?? 0;
        const targetStock = Math.max(medicine.lowStockThreshold * 2, 1);
        return {
          medicine: medicine.name,
          inventorySection: medicine.inventorySection?.trim() || "Uncategorized",
          category: medicine.category ?? "",
          currentStock: medicine.quantity,
          unit: medicine.unit,
          reorderThreshold: medicine.lowStockThreshold,
          pendingOrderQuantity,
          suggestedOrderQuantity: Math.max(
            0,
            targetStock - medicine.quantity - pendingOrderQuantity,
          ),
          status: medicine.quantity <= 0 ? "Out of stock" : "Low stock",
        };
      });
  }

  async getMedicineUsageExport(
    startDate: Date,
    endDate: Date,
    patientType?: ReportPatientType,
  ): Promise<MedicineUsageExportRow[]> {
    return MedicineDispense.aggregate<MedicineUsageExportRow>([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      ...(patientType ? [
        { $lookup: { from: "clinicvisits", localField: "visitId", foreignField: "_id", as: "visit" } },
        { $lookup: { from: "patients", localField: "visit.patientId", foreignField: "_id", as: "patient" } },
        { $match: patientType === "student"
          ? { $or: [{ "patient.patientType": "student" }, { "patient.patientType": { $exists: false } }] }
          : patientType === "employees" ? { "patient.patientType": { $in: ["teacher", "staff"] } }
          : { "patient.patientType": patientType } },
      ] : []),
      {
        $group: {
          _id: "$medicineId",
          quantityDispensed: { $sum: "$quantity" },
          dispenseCount: { $sum: 1 },
          unit: { $first: "$unit" },
        },
      },
      {
        $lookup: {
          from: "medicines",
          localField: "_id",
          foreignField: "_id",
          as: "medicine",
        },
      },
      { $unwind: { path: "$medicine", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: { $ifNull: ["$medicine.name", "Archived medicine"] },
          inventorySection: { $ifNull: ["$medicine.inventorySection", "Uncategorized"] },
          unit: 1,
          quantityDispensed: 1,
          dispenseCount: 1,
        },
      },
      { $sort: { quantityDispensed: -1, name: 1 } },
    ]);
  }

  async getMedicationUsageDetails(
    startDate: Date,
    endDate: Date,
    patientType?: ReportPatientType,
  ): Promise<MedicationUsageDetailRow[]> {
    return MedicineDispense.aggregate<MedicationUsageDetailRow>([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $lookup: { from: "medicines", localField: "medicineId", foreignField: "_id", as: "medicine" } },
      { $lookup: { from: "clinicvisits", localField: "visitId", foreignField: "_id", as: "visit" } },
      { $unwind: { path: "$visit", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "patients", localField: "visit.patientId", foreignField: "_id", as: "patient" } },
      ...(patientType ? [{ $match: patientType === "student"
        ? { $or: [{ "patient.patientType": "student" }, { "patient.patientType": { $exists: false } }] }
        : patientType === "employees" ? { "patient.patientType": { $in: ["teacher", "staff"] } }
        : { "patient.patientType": patientType } }] : []),
      { $lookup: { from: "users", localField: "dispensedBy", foreignField: "_id", as: "actor" } },
      {
        $project: {
          _id: 0,
          dispensedAt: "$createdAt",
          studentId: { $ifNull: [{ $arrayElemAt: ["$patient.studentId", 0] }, ""] },
          studentName: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: [{ $arrayElemAt: ["$patient.firstName", 0] }, ""] },
                  " ",
                  { $ifNull: [{ $arrayElemAt: ["$patient.lastName", 0] }, ""] },
                ],
              },
            },
          },
          patientType: { $ifNull: [{ $arrayElemAt: ["$patient.patientType", 0] }, "student"] },
          complaint: { $ifNull: ["$visit.complaint", ""] },
          medicine: {
            $ifNull: [{ $arrayElemAt: ["$medicine.name", 0] }, "Archived medicine"],
          },
          quantity: 1,
          unit: 1,
          instructions: { $ifNull: ["$instructions", ""] },
          recordedBy: { $ifNull: [{ $arrayElemAt: ["$actor.name", 0] }, "Unknown user"] },
        },
      },
      { $sort: { dispensedAt: -1 } },
    ]);
  }

  async getMedicationInventoryReport(
    startDate: Date,
    endDate: Date,
  ): Promise<MedicationInventoryReportRow[]> {
    if (startDate > endDate) {
      throw new AppError("startDate must be before endDate", 400);
    }

    const [medicines, dispenseTotals, batches] = await Promise.all([
      Medicine.find()
        .select("name inventorySection category dateReceived quantity unit expiryDate lowStockThreshold")
        .sort({ name: 1 })
        .lean(),
      MedicineDispense.aggregate<{ _id: unknown; totalPrescribed: number }>([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: "$medicineId", totalPrescribed: { $sum: "$quantity" } } },
      ]),
      InventoryBatch.find({
        receivedAt: { $lte: endDate },
      })
        .select("medicineId receivedAt expiryDate quantityRemaining")
        .sort({ receivedAt: -1 })
        .lean(),
    ]);

    const prescribedByMedicine = new Map(
      dispenseTotals.map((item) => [String(item._id), item.totalPrescribed]),
    );
    const batchesByMedicine = new Map<string, typeof batches>();
    for (const batch of batches) {
      const key = String(batch.medicineId);
      const existing = batchesByMedicine.get(key) ?? [];
      existing.push(batch);
      batchesByMedicine.set(key, existing);
    }

    const now = new Date();
    return medicines.map((medicine) => {
      const medicineBatches = batchesByMedicine.get(String(medicine._id)) ?? [];
      const receivedInPeriod = medicineBatches.filter(
        (batch) => batch.receivedAt >= startDate && batch.receivedAt <= endDate,
      );
      const activeExpiries = medicineBatches
        .filter((batch) => batch.quantityRemaining > 0 && batch.expiryDate)
        .map((batch) => batch.expiryDate as Date)
        .sort((a, b) => a.getTime() - b.getTime());
      const expirationDate = activeExpiries[0] ?? medicine.expiryDate ?? null;
      const dateReceived =
        receivedInPeriod[0]?.receivedAt ??
        (medicine.dateReceived && medicine.dateReceived >= startDate && medicine.dateReceived <= endDate
          ? medicine.dateReceived
          : null);

      const remarks = expirationDate && expirationDate < now
        ? "Expired"
        : medicine.quantity <= 0
          ? "Out of stock"
          : medicine.quantity <= medicine.lowStockThreshold
            ? "Low stock"
            : "In stock";

      return {
        name: medicine.name,
        inventorySection: medicine.inventorySection?.trim() || medicine.category?.trim() || "Uncategorized",
        dateReceived,
        totalPrescribed: prescribedByMedicine.get(String(medicine._id)) ?? 0,
        remainingStock: medicine.quantity,
        unit: medicine.unit,
        expirationDate,
        remarks,
      };
    });
  }

  async getAnnualMedicationReport(): Promise<AnnualMedicationReport> {
    const settings = await SystemSettings.findOne({ key: "clinic" })
      .select("schoolYear")
      .lean();
    const currentYear = new Date().getFullYear();
    const schoolYear = settings?.schoolYear ?? `${currentYear}-${currentYear + 1}`;
    const match = /^(\d{4})-(\d{4})$/.exec(schoolYear);
    if (!match) {
      throw new AppError("The configured school year must use YYYY-YYYY", 400);
    }

    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    if (endYear !== startYear + 1) {
      throw new AppError("The configured school year must contain consecutive years", 400);
    }

    const monthDefinitions = [
      { month: 7, year: startYear, label: "July" },
      { month: 8, year: startYear, label: "Aug." },
      { month: 9, year: startYear, label: "Sept." },
      { month: 10, year: startYear, label: "Oct." },
      { month: 11, year: startYear, label: "Nov." },
      { month: 12, year: startYear, label: "Dec." },
      { month: 1, year: endYear, label: "Jan." },
      { month: 2, year: endYear, label: "Feb." },
      { month: 3, year: endYear, label: "March" },
      { month: 4, year: endYear, label: "April" },
      { month: 5, year: endYear, label: "May" },
    ];
    const months = monthDefinitions.map(({ month, year, label }) => ({
      key: `${year}-${String(month).padStart(2, "0")}`,
      label,
      year,
    }));
    const { start } = clinicDayRange(`${startYear}-07-01`);
    const { start: endExclusive } = clinicDayRange(`${endYear}-06-01`);
    const timeZone = process.env.CLINIC_TIME_ZONE || "Asia/Manila";

    const [medicines, usage] = await Promise.all([
      Medicine.find()
        .select("name category inventorySection unit quantity")
        .sort({ inventorySection: 1, category: 1, name: 1 })
        .lean(),
      MedicineDispense.aggregate<{
        _id: { medicineId: unknown; month: string };
        quantity: number;
      }>([
        { $match: { createdAt: { $gte: start, $lt: endExclusive } } },
        {
          $group: {
            _id: {
              medicineId: "$medicineId",
              month: {
                $dateToString: {
                  date: "$createdAt",
                  format: "%Y-%m",
                  timezone: timeZone,
                },
              },
            },
            quantity: { $sum: "$quantity" },
          },
        },
      ]),
    ]);

    const usageByMedicine = new Map<string, Map<string, number>>();
    for (const entry of usage) {
      const medicineId = String(entry._id.medicineId);
      const medicineUsage = usageByMedicine.get(medicineId) ?? new Map<string, number>();
      medicineUsage.set(entry._id.month, entry.quantity);
      usageByMedicine.set(medicineId, medicineUsage);
    }

    return {
      schoolYear,
      campus: process.env.CAMPUS_NAME || "MAIN CAMPUS",
      months,
      rows: medicines.map((medicine) => {
        const medicineUsage = usageByMedicine.get(String(medicine._id));
        const monthlyConsumed = months.map((month) => medicineUsage?.get(month.key) ?? 0);
        return {
          category:
            medicine.inventorySection?.trim() ||
            medicine.category?.trim() ||
            "UNCATEGORIZED",
          name: medicine.name,
          unit: medicine.unit,
          monthlyConsumed,
          totalConsumed: monthlyConsumed.reduce((sum, value) => sum + value, 0),
          remainingStock: medicine.quantity,
        };
      }),
    };
  }

  async getVaccinationExport(patientType?: ReportPatientType): Promise<VaccinationExportRow[]> {
    const typeFilter: Record<string, unknown> = patientType === "student"
      ? { $or: [{ patientType: "student" }, { patientType: { $exists: false } }] }
      : patientType === "employees" ? { patientType: { $in: ["teacher", "staff"] } }
      : patientType ? { patientType } : {};
    const students = await Patient.find({ isActive: true, ...typeFilter })
      .select("patientType studentId firstName lastName immunizations")
      .sort({ lastName: 1, firstName: 1 })
      .lean();

    return students.flatMap((student) => {
      const studentName = `${student.firstName} ${student.lastName}`;
      const patientType = student.patientType ?? "student";
      if (!student.immunizations?.length) {
        return [{
          studentId: student.studentId,
          studentName,
          patientType,
          vaccine: "No immunization recorded",
          dateAdministered: null,
          notes: "",
        }];
      }

      return student.immunizations.map((immunization) => ({
        studentId: student.studentId,
        studentName,
        patientType,
        vaccine: immunization.vaccine,
        dateAdministered: immunization.dateAdministered ?? null,
        notes: immunization.notes ?? "",
      }));
    });
  }
}
