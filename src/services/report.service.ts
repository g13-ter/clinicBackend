import Patient from "../models/patient.model";
import ClinicVisit from "../models/clinicVisit.model";
import MedicalHistory from "../models/medicalHistory.model";
import Appointment from "../models/appointment.model";
import Medicine from "../models/medicine.model";
import { AppError } from "../middleware/error.middleware";

export interface ReportStats {
  periodStart: Date;
  periodEnd: Date;

  newPatients: number;

  totalVisits: number;
  topComplaints: { complaint: string; count: number }[];

  newMedicalHistoryEntries: number;

  appointments: {
    total: number;
    byStatus: Record<string, number>;
  };

  lowStockMedicines: { name: string; quantity: number; unit: string }[];
  newMedicinesAdded: number;
}

export class ReportService {
  async getClinicSummary(startDate: Date, endDate: Date): Promise<ReportStats> {
    if (startDate > endDate) {
      throw new AppError("startDate must be before endDate", 400);
    }

    const dateFilter = { createdAt: { $gte: startDate, $lte: endDate } };

    const [
      newPatients,
      totalVisits,
      topComplaintsAgg,
      newMedicalHistoryEntries,
      appointmentsInPeriod,
      lowStockMedicines,
      newMedicinesAdded,
    ] = await Promise.all([
      Patient.countDocuments(dateFilter),

      ClinicVisit.countDocuments(dateFilter),

      ClinicVisit.aggregate([
        { $match: dateFilter },
        { $group: { _id: "$complaint", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),

      MedicalHistory.countDocuments(dateFilter),

      Appointment.find(dateFilter).select("status"),

      // low stock is a CURRENT snapshot, not period-filtered -
      // the board wants to know what's low right now, not what was low
      // at some point during the period
      Medicine.find().select("name quantity unit lowStockThreshold"),

      Medicine.countDocuments(dateFilter),
    ]);

    const topComplaints = topComplaintsAgg.map((item: any) => ({
      complaint: item._id || "Unspecified",
      count: item.count,
    }));

    const byStatus: Record<string, number> = {};
    for (const appt of appointmentsInPeriod) {
      byStatus[appt.status] = (byStatus[appt.status] || 0) + 1;
    }

    const lowStock = lowStockMedicines
      .filter((med: any) => med.quantity <= med.lowStockThreshold)
      .map((med: any) => ({
        name: med.name,
        quantity: med.quantity,
        unit: med.unit,
      }));

    return {
      periodStart: startDate,
      periodEnd: endDate,
      newPatients,
      totalVisits,
      topComplaints,
      newMedicalHistoryEntries,
      appointments: {
        total: appointmentsInPeriod.length,
        byStatus,
      },
      lowStockMedicines: lowStock,
      newMedicinesAdded,
    };
  }
}