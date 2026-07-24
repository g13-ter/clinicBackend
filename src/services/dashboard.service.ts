import Patient from "../models/patient.model";
import User from "../models/user.model";
import Appointment from "../models/appointment.model";
import ClinicVisit from "../models/clinicVisit.model";
import MedicalHistory from "../models/medicalHistory.model";
import Medicine, { IMedicine } from "../models/medicine.model";
import PurchaseRequest from "../models/purchaseRequest.model";
import AuditLog from "../models/auditLog.model";
import { computeStatus } from "./medicine.service";

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfToday = (): Date => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfMonth = (): Date => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

export interface DashboardStats {
  totalStudents: number;
  usersByRole: { doctor: number; nurse: number; staff: number; admin: number };
  todaysAppointments: number;
  waitingPatients: number;
  monthlyConsultations: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiredCount: number;
  pendingPurchaseRequests: number;
  recentActivity: {
    action: string;
    resource: string;
    resourceId: string;
    performedBy: unknown;
    createdAt: Date;
  }[];
}

const RECENT_ACTIVITY_LIMIT = 15;

export class DashboardService {
  async getStats(): Promise<DashboardStats> {
    const [
      totalStudents,
      doctorCount,
      nurseCount,
      staffCount,
      adminCount,
      todaysAppointments,
      waitingPatients,
      monthlyConsultations,
      allMedicines,
      pendingPurchaseRequests,
      recentActivityDocs,
    ] = await Promise.all([
      Patient.countDocuments({ isActive: true }),
      User.countDocuments({ role: "doctor" }),
      User.countDocuments({ role: "nurse" }),
      User.countDocuments({ role: "staff" }),
      User.countDocuments({ role: "admin" }),
      Appointment.countDocuments({
        appointmentDate: { $gte: startOfToday(), $lte: endOfToday() },
        status: { $ne: "cancelled" },
      }),
      // A clinic visit that's still "active" (not yet archived/completed)
      // represents a patient currently in the queue.
      ClinicVisit.countDocuments({ isActive: true }),
      MedicalHistory.countDocuments({ dateRecorded: { $gte: startOfMonth() } }),
      Medicine.find(),
      PurchaseRequest.countDocuments({ status: "pending" }),
      AuditLog.find()
        .populate("performedBy", "name role")
        .sort({ createdAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT),
    ]);

    let lowStockCount = 0;
    let outOfStockCount = 0;
    let expiredCount = 0;

    for (const med of allMedicines as IMedicine[]) {
      const status = computeStatus(med);
      if (status === "Low Stock") lowStockCount += 1;
      else if (status === "Out of Stock") outOfStockCount += 1;
      else if (status === "Expired") expiredCount += 1;
    }

    return {
      totalStudents,
      usersByRole: { doctor: doctorCount, nurse: nurseCount, staff: staffCount, admin: adminCount },
      todaysAppointments,
      waitingPatients,
      monthlyConsultations,
      lowStockCount,
      outOfStockCount,
      expiredCount,
      pendingPurchaseRequests,
      recentActivity: recentActivityDocs.map((log) => ({
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        performedBy: log.performedBy,
        createdAt: log.createdAt,
      })),
    };
  }
}