import ClinicVisit from "../models/clinicVisit.model";
import Medicine, { IMedicine } from "../models/medicine.model";
import Appointment from "../models/appointment.model";
import MedicalHistory from "../models/medicalHistory.model";
import PurchaseRequest from "../models/purchaseRequest.model";
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

  // Section II - Clinic Attendance
  // "Students" reflects every clinic visit in the period, broken down by
  // the visiting patient's gender. Teaching/Non-Teaching Staff are not
  // tracked at all - this system only manages student patient records,
  // so those rows are honestly reported as not applicable rather than
  // guessed at.
  studentAttendance: GenderBreakdown;

  // Section III - Common Reasons for Clinic Visits
  // Every distinct complaint recorded, sorted by frequency. The original
  // template lists fixed categories (Headache, Fever, etc.) but this
  // system records free-text complaints, so we report what was actually
  // logged instead of forcing it into a fixed list that might not match.
  complaintCounts: ComplaintCount[];

  // Section IV - Medicines and Supplies
  // This system tracks CURRENT stock, not a historical dispensing log,
  // so "quantity used" during the period cannot be computed accurately.
  // We report current remaining stock honestly instead of fabricating
  // a usage figure.
  medicineStock: MedicineStockRow[];

  // Section VIII - Issues and Concerns
  lowStockMedicines: MedicineStockRow[];

  // Appointments booked within the period, broken down by their CURRENT
  // status (a "confirmed" appointment booked in-period may have since
  // been completed/cancelled by the time the report runs - that's the
  // accurate real-time picture, not a snapshot frozen at booking time).
  appointmentStats: AppointmentBreakdown;

  // Doctor consultations (medical history entries) recorded in the period.
  consultationsCount: number;

  // Pending purchase requests awaiting admin review right now (a current
  // snapshot, not period-filtered - same reasoning as medicine stock above:
  // what matters operationally is what's outstanding today, not what was
  // pending at some point during the period).
  pendingPurchaseRequestsCount: number;
}

export class ReportService {
  async getClinicSummary(startDate: Date, endDate: Date): Promise<ReportStats> {
    if (startDate > endDate) {
      throw new AppError("startDate must be before endDate", 400);
    }

    const visitDateFilter = { visitDate: { $gte: startDate, $lte: endDate }, isActive: true };
    const appointmentDateFilter = { appointmentDate: { $gte: startDate, $lte: endDate } };
    const consultationDateFilter = { dateRecorded: { $gte: startDate, $lte: endDate } };

    const [visitsInPeriod, allMedicines, appointmentsInPeriod, consultationsCount, pendingPurchaseRequestsCount] =
      await Promise.all([
        ClinicVisit.find(visitDateFilter)
          .populate("patientId", "gender")
          .select("complaint patientId"),

        Medicine.find().select("name quantity unit lowStockThreshold"),

        Appointment.find(appointmentDateFilter).select("status"),

        MedicalHistory.countDocuments(consultationDateFilter),

        // Current snapshot, not period-filtered - see note on the interface above.
        PurchaseRequest.countDocuments({ status: "pending" }),
      ]);

    // ----- Student attendance by gender -----
    let male = 0;
    let female = 0;

    for (const visit of visitsInPeriod) {
      const patient = visit.patientId as PopulatedPatientRef | null;
      if (patient?.gender === "Male") male++;
      else if (patient?.gender === "Female") female++;
      // a visit whose patient record was deleted/unlinked is still
      // counted in the total below, just not in the gender split
    }

    const studentAttendance: GenderBreakdown = {
      male,
      female,
      total: visitsInPeriod.length,
    };

    // ----- Common complaints -----
    const complaintMap = new Map<string, number>();
    for (const visit of visitsInPeriod) {
      const key = visit.complaint?.trim() || "Unspecified";
      complaintMap.set(key, (complaintMap.get(key) || 0) + 1);
    }

    const complaintCounts: ComplaintCount[] = Array.from(complaintMap.entries())
      .map(([complaint, count]) => ({ complaint, count }))
      .sort((a, b) => b.count - a.count);

    // ----- Medicine stock (current snapshot, not period-filtered - the
    // report should reflect what's on hand right now, not what was on
    // hand at some point during the period) -----
    const medicineStock: MedicineStockRow[] = allMedicines.map((med: IMedicine) => ({
      name: med.name,
      remainingStock: med.quantity,
      unit: med.unit,
      isLowStock: med.quantity <= med.lowStockThreshold,
    }));

    const lowStockMedicines = medicineStock.filter((med) => med.isLowStock);

    // ----- Appointment breakdown by current status -----
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
      consultationsCount,
      pendingPurchaseRequestsCount,
    };
  }
}