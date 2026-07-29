import Patient from "../models/patient.model";
import User from "../models/user.model";
import Appointment from "../models/appointment.model";
import ClinicVisit from "../models/clinicVisit.model";
import MedicalHistory from "../models/medicalHistory.model";
import Medicine, { IMedicine } from "../models/medicine.model";
import PurchaseRequest from "../models/purchaseRequest.model";
import AuditLog from "../models/auditLog.model";
import { computeStatus } from "./medicine.service";
import { clinicDateKey, clinicDayRange } from "../utils/clinicTime";

const todayRange = () => clinicDayRange(clinicDateKey());

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
  todayVisits: number;
  consultationsToday: number;
  emergencyCasesToday: number;
  pendingAppointments: number;
  waitingPatients: number;
  monthlyConsultations: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiredCount: number;
  pendingPurchaseRequests: number;
  activeUsers: {
    id: string;
    name: string;
    email: string;
    role: "doctor" | "nurse" | "staff";
    scheduleNotes?: string;
  }[];
  commonComplaints: { label: string; count: number }[];
  monthlyVisits: { key: string; month: string; visits: number }[];
  recentCases: {
    id: string;
    date: Date;
    student: { id: string; name: string; studentId: string } | null;
    complaint: string;
    assessment: string;
    treatment: string;
    provider: { id: string; name: string; role: "doctor" | "nurse" } | null;
  }[];
  recentActivity: {
    action: string;
    resource: string;
    resourceId: string;
    performedBy: unknown;
    createdAt: Date;
  }[];
}

const RECENT_ACTIVITY_LIMIT = 15;
const RECENT_CASES_LIMIT = 8;

const startOfDashboardRange = (): Date => {
  const date = startOfMonth();
  date.setMonth(date.getMonth() - 5);
  return date;
};

const monthKeys = (): { key: string; month: string }[] => {
  const formatter = new Intl.DateTimeFormat("en", { month: "short" });
  return Array.from({ length: 6 }, (_, index) => {
    const date = startOfDashboardRange();
    date.setMonth(date.getMonth() + index);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      month: formatter.format(date),
    };
  });
};

const titleCase = (value: string): string =>
  value.replace(/\b\w/g, (character) => character.toUpperCase());

export class DashboardService {
  async getStats(doctorId?: string): Promise<DashboardStats> {
    const { start: todayStart, endExclusive: todayEnd } = todayRange();
    const doctorScope = doctorId ? { doctorId } : {};
    const [
      totalStudents,
      doctorCount,
      nurseCount,
      staffCount,
      adminCount,
      todaysAppointments,
      todayVisits,
      consultationsToday,
      emergencyCasesToday,
      pendingAppointments,
      waitingPatients,
      monthlyConsultations,
      allMedicines,
      pendingPurchaseRequests,
      activeUserDocs,
      commonComplaintDocs,
      monthlyVisitDocs,
      recentCaseDocs,
      recentActivityDocs,
    ] = await Promise.all([
      Patient.countDocuments({ isActive: true }),
      User.countDocuments({ role: "doctor", isAvailable: { $ne: false } }),
      User.countDocuments({ role: "nurse", isAvailable: { $ne: false } }),
      User.countDocuments({ role: "staff", isAvailable: { $ne: false } }),
      User.countDocuments({ role: "admin" }),
      Appointment.countDocuments({
        appointmentDate: { $gte: todayStart, $lt: todayEnd },
        status: { $ne: "cancelled" },
        ...doctorScope,
      }),
      ClinicVisit.countDocuments({
        visitDate: { $gte: todayStart, $lt: todayEnd },
      }),
      ClinicVisit.countDocuments({
        visitDate: { $gte: todayStart, $lt: todayEnd },
        status: { $in: ["in_consultation", "completed", "referred"] },
      }),
      ClinicVisit.countDocuments({
        visitDate: { $gte: todayStart, $lt: todayEnd },
        isEmergency: true,
      }),
      Appointment.countDocuments({ status: "pending", ...doctorScope }),
      // Active visits represent the current queue.
      ClinicVisit.countDocuments({
        isActive: true,
        status: { $in: ["triage", "ready_for_doctor", "in_consultation", "paused"] },
      }),
      MedicalHistory.countDocuments({ dateRecorded: { $gte: startOfMonth() } }),
      Medicine.find(),
      PurchaseRequest.countDocuments({ status: "pending" }),
      User.find({
        role: { $in: ["doctor", "nurse", "staff"] },
        isAvailable: { $ne: false },
      })
        .select("name email role scheduleNotes")
        .sort({ role: 1, name: 1 })
        .lean(),
      ClinicVisit.aggregate<{ _id: string; count: number }>([
        { $match: { complaint: { $type: "string", $ne: "" } } },
        {
          $group: {
            _id: { $toLower: { $trim: { input: "$complaint" } } },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 5 },
      ]),
      ClinicVisit.aggregate<{ _id: string; visits: number }>([
        { $match: { visitDate: { $gte: startOfDashboardRange() } } },
        {
          $group: {
            _id: {
              $dateToString: {
                date: "$visitDate",
                format: "%Y-%m",
                timezone: "Asia/Manila",
              },
            },
            visits: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ClinicVisit.find()
        .populate("patientId", "studentId firstName lastName")
        .populate("recordedBy", "name role")
        .populate("updatedBy", "name role")
        .sort({ visitDate: -1 })
        .limit(RECENT_CASES_LIMIT)
        .lean(),
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

    const visitCounts = new Map(monthlyVisitDocs.map((entry) => [entry._id, entry.visits]));
    const monthlyVisits = monthKeys().map((entry) => ({
      ...entry,
      visits: visitCounts.get(entry.key) ?? 0,
    }));

    type PopulatedUser = { _id: unknown; name: string; role: string };
    type PopulatedPatient = { _id: unknown; studentId: string; firstName: string; lastName: string };
    const recentCases = (recentCaseDocs as unknown as Array<{
      _id: unknown;
      visitDate: Date;
      patientId?: PopulatedPatient;
      complaint: string;
      treatment?: string;
      consultationFindings?: string;
      nursingAssessment?: string;
      updatedBy?: PopulatedUser;
      recordedBy?: PopulatedUser;
    }>).map((visit) => {
      const updatedBy = visit.updatedBy;
      const recordedBy = visit.recordedBy;
      const providerCandidate =
        updatedBy && ["doctor", "nurse"].includes(updatedBy.role)
          ? updatedBy
          : recordedBy && ["doctor", "nurse"].includes(recordedBy.role)
            ? recordedBy
            : null;

      return {
        id: String(visit._id),
        date: visit.visitDate,
        student: visit.patientId
          ? {
              id: String(visit.patientId._id),
              name: `${visit.patientId.firstName} ${visit.patientId.lastName}`,
              studentId: visit.patientId.studentId,
            }
          : null,
        complaint: visit.complaint,
        assessment: visit.consultationFindings || visit.nursingAssessment || "Not recorded",
        treatment: visit.treatment || "Not recorded",
        provider: providerCandidate
          ? {
              id: String(providerCandidate._id),
              name: providerCandidate.name,
              role: providerCandidate.role as "doctor" | "nurse",
            }
          : null,
      };
    });

    return {
      totalStudents,
      usersByRole: { doctor: doctorCount, nurse: nurseCount, staff: staffCount, admin: adminCount },
      todaysAppointments,
      todayVisits,
      consultationsToday,
      emergencyCasesToday,
      pendingAppointments,
      waitingPatients,
      monthlyConsultations,
      lowStockCount,
      outOfStockCount,
      expiredCount,
      pendingPurchaseRequests,
      activeUsers: activeUserDocs.map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role as "doctor" | "nurse" | "staff",
        ...(user.scheduleNotes ? { scheduleNotes: user.scheduleNotes } : {}),
      })),
      commonComplaints: commonComplaintDocs.map((entry) => ({
        label: titleCase(entry._id),
        count: entry.count,
      })),
      monthlyVisits,
      recentCases,
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
