import ClinicVisit from "../models/clinicVisit.model";
import Medicine, { IMedicine } from "../models/medicine.model";
import Appointment from "../models/appointment.model";
import MedicalHistory from "../models/medicalHistory.model";
import PurchaseRequest from "../models/purchaseRequest.model";
import MedicineDispense from "../models/medicineDispense.model";
import Patient from "../models/patient.model";
import { AppError } from "../middleware/error.middleware";

interface PopulatedPatientRef {
  gender?: string;
}

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

  // Free-text complaints sorted by frequency.
  complaintCounts: ComplaintCount[];

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
  category: string;
  quantity: number;
  unit: string;
  lowStockThreshold: number;
  expiryDate: Date | null;
  status: string;
}

export interface MedicineUsageExportRow {
  name: string;
  unit: string;
  quantityDispensed: number;
  dispenseCount: number;
}

export interface VaccinationExportRow {
  studentId: string;
  studentName: string;
  vaccine: string;
  dateAdministered: Date | null;
  notes: string;
}

export class ReportService {
  async getClinicSummary(startDate: Date, endDate: Date): Promise<ReportStats> {
    if (startDate > endDate) {
      throw new AppError("startDate must be before endDate", 400);
    }

    const visitDateFilter = { visitDate: { $gte: startDate, $lte: endDate }, isActive: true };
    const appointmentDateFilter = { appointmentDate: { $gte: startDate, $lte: endDate } };
    const consultationDateFilter = { dateRecorded: { $gte: startDate, $lte: endDate } };

    const [visitsInPeriod, allMedicines, appointmentsInPeriod, physicianMedicalRecordsCount, pendingPurchaseRequestsCount] =
      await Promise.all([
        ClinicVisit.find(visitDateFilter)
          .populate("patientId", "gender")
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
      complaintCounts,
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
      .select("name category quantity unit lowStockThreshold expiryDate")
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
        category: medicine.category ?? "",
        quantity: medicine.quantity,
        unit: medicine.unit,
        lowStockThreshold: medicine.lowStockThreshold,
        expiryDate,
        status,
      };
    });
  }

  async getMedicineUsageExport(
    startDate: Date,
    endDate: Date,
  ): Promise<MedicineUsageExportRow[]> {
    return MedicineDispense.aggregate<MedicineUsageExportRow>([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
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
          unit: 1,
          quantityDispensed: 1,
          dispenseCount: 1,
        },
      },
      { $sort: { quantityDispensed: -1, name: 1 } },
    ]);
  }

  async getVaccinationExport(): Promise<VaccinationExportRow[]> {
    const students = await Patient.find({ isActive: true })
      .select("studentId firstName lastName immunizations")
      .sort({ lastName: 1, firstName: 1 })
      .lean();

    return students.flatMap((student) => {
      const studentName = `${student.firstName} ${student.lastName}`;
      if (!student.immunizations?.length) {
        return [{
          studentId: student.studentId,
          studentName,
          vaccine: "No immunization recorded",
          dateAdministered: null,
          notes: "",
        }];
      }

      return student.immunizations.map((immunization) => ({
        studentId: student.studentId,
        studentName,
        vaccine: immunization.vaccine,
        dateAdministered: immunization.dateAdministered ?? null,
        notes: immunization.notes ?? "",
      }));
    });
  }
}
