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

export type AnalyticsPatientType = "all" | "student" | "teacher" | "staff";

export interface SuperAdminDashboardSummary {
  accounts: {
    total: number;
    active: number;
    inactive: number;
    administrators: number;
    inactiveAdministrators: number;
  };
  failedPrivilegedActions: number;
  recentPrivilegedActivity: Array<{
    _id: unknown;
    action: string;
    resource: string;
    resourceId: string;
    performedBy: unknown;
    actorSnapshot?: { userId: string; name: string; email: string; role: string };
    createdAt: Date;
  }>;
}

const todayRange = () => clinicDayRange(clinicDateKey());

const startOfMonth = (): Date => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

export interface DashboardStats {
  totalStudents: number;
  totalPatients: number;
  patientsByType: { student: number; teacher: number; staff: number };
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
  analyticsPatientType: AnalyticsPatientType;
  analyticsTotalVisits: number;
  analyticsVisitBreakdown: { student: number; teacher: number; staff: number };
  bmiRecordedCount: number;
  bmiBreakdown: { underweight: number; normalWeight: number; overweight: number; obese: number };
  recentCases: {
    id: string;
    date: Date;
    student: { id: string; name: string; studentId: string; patientType: "student" | "teacher" | "staff" } | null;
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
  async getSuperAdminSummary(): Promise<SuperAdminDashboardSummary> {
    const recentFailureWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const privilegedResources = ["User", "SystemSettings"];
    const [total, active, administrators, inactiveAdministrators, failedPrivilegedActions, recentPrivilegedActivity] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: { $ne: false } }),
      User.countDocuments({ role: { $in: ["admin", "superadmin"] } }),
      User.countDocuments({ role: { $in: ["admin", "superadmin"] }, isActive: false }),
      AuditLog.countDocuments({
        resource: { $in: privilegedResources },
        "changes.after.successful": false,
        createdAt: { $gte: recentFailureWindow },
      }),
      AuditLog.find({ resource: { $in: privilegedResources }, action: { $ne: "view" } })
        .select("action resource resourceId performedBy actorSnapshot createdAt")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
    ]);

    return {
      accounts: {
        total,
        active,
        inactive: total - active,
        administrators,
        inactiveAdministrators,
      },
      failedPrivilegedActions,
      recentPrivilegedActivity,
    };
  }

  async getStats(doctorId?: string, analyticsPatientType: AnalyticsPatientType = "all"): Promise<DashboardStats> {
    const { start: todayStart, endExclusive: todayEnd } = todayRange();
    const doctorScope = doctorId ? { doctorId } : {};
    const patientType = analyticsPatientType === "all" ? undefined : analyticsPatientType;
    const patientTypeQuery: Record<string, unknown> = patientType === "student"
      ? { $or: [{ patientType: "student" }, { patientType: { $exists: false } }] }
      : patientType ? { patientType } : {};
    const analyticsPatientIds = patientType
      ? await Patient.find(patientTypeQuery).distinct("_id")
      : undefined;
    const analyticsPatientFilter = analyticsPatientIds
      ? { patientId: { $in: analyticsPatientIds } }
      : {};
    const analyticsRange = { visitDate: { $gte: startOfDashboardRange() }, isActive: true };
    const [
      patientCountDocs,
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
      analyticsBreakdownDocs,
      bmiBreakdownDocs,
      recentCaseDocs,
      recentActivityDocs,
    ] = await Promise.all([
      Patient.aggregate<{ _id: "student" | "teacher" | "staff"; count: number }>([
        { $match: { isActive: true } },
        { $group: { _id: { $ifNull: ["$patientType", "student"] }, count: { $sum: 1 } } },
      ]),
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
        { $match: { ...analyticsRange, ...analyticsPatientFilter, complaint: { $type: "string", $ne: "" } } },
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
        { $match: { ...analyticsRange, ...analyticsPatientFilter } },
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
      ClinicVisit.aggregate<{ _id: "student" | "teacher" | "staff"; visits: number }>([
        { $match: { ...analyticsRange, ...analyticsPatientFilter } },
        { $lookup: { from: "patients", localField: "patientId", foreignField: "_id", as: "patient" } },
        { $unwind: { path: "$patient", preserveNullAndEmptyArrays: true } },
        { $group: { _id: { $ifNull: ["$patient.patientType", "student"] }, visits: { $sum: 1 } } },
      ]),
      ClinicVisit.aggregate<{ _id: "underweight" | "normalWeight" | "overweight" | "obese"; count: number }>([
        { $match: { ...analyticsRange, ...analyticsPatientFilter, bmi: { $type: "number" } } },
        {
          $project: {
            category: {
              $switch: {
                branches: [
                  { case: { $lt: ["$bmi", 18.5] }, then: "underweight" },
                  { case: { $lt: ["$bmi", 25] }, then: "normalWeight" },
                  { case: { $lt: ["$bmi", 30] }, then: "overweight" },
                ],
                default: "obese",
              },
            },
          },
        },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      ClinicVisit.find({ ...analyticsRange, ...analyticsPatientFilter })
        .populate("patientId", "patientType studentId firstName lastName")
        .populate("assignedDoctorId", "name role")
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
    const analyticsVisitBreakdown = { student: 0, teacher: 0, staff: 0 };
    for (const entry of analyticsBreakdownDocs) analyticsVisitBreakdown[entry._id] = entry.visits;
    const analyticsTotalVisits = patientType
      ? analyticsVisitBreakdown[patientType]
      : analyticsVisitBreakdown.student + analyticsVisitBreakdown.teacher + analyticsVisitBreakdown.staff;
    const bmiBreakdown = { underweight: 0, normalWeight: 0, overweight: 0, obese: 0 };
    for (const entry of bmiBreakdownDocs) bmiBreakdown[entry._id] = entry.count;
    const bmiRecordedCount = Object.values(bmiBreakdown).reduce((sum, count) => sum + count, 0);

    type PopulatedUser = { _id: unknown; name: string; role: string };
    type PopulatedPatient = { _id: unknown; patientType?: "student" | "teacher" | "staff"; studentId: string; firstName: string; lastName: string };
    const recentCases = (recentCaseDocs as unknown as Array<{
      _id: unknown;
      visitDate: Date;
      patientId?: PopulatedPatient;
      complaint: string;
      treatment?: string;
      consultationFindings?: string;
      nursingAssessment?: string;
      assignedDoctorId?: PopulatedUser;
      updatedBy?: PopulatedUser;
      recordedBy?: PopulatedUser;
    }>).map((visit) => {
      const assignedDoctor = visit.assignedDoctorId;
      const updatedBy = visit.updatedBy;
      const recordedBy = visit.recordedBy;
      const doctorCandidate =
        assignedDoctor?.role === "doctor"
          ? assignedDoctor
          : updatedBy?.role === "doctor"
            ? updatedBy
            : recordedBy?.role === "doctor"
              ? recordedBy
              : null;
      const nurseCandidate =
        updatedBy?.role === "nurse"
          ? updatedBy
          : recordedBy?.role === "nurse"
            ? recordedBy
            : null;
      const providerCandidate = visit.consultationFindings
        ? doctorCandidate ?? nurseCandidate
        : nurseCandidate ?? doctorCandidate;

      return {
        id: String(visit._id),
        date: visit.visitDate,
        student: visit.patientId
          ? {
              id: String(visit.patientId._id),
              name: `${visit.patientId.firstName} ${visit.patientId.lastName}`,
              studentId: visit.patientId.studentId,
              patientType: visit.patientId.patientType ?? "student",
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

    const patientsByType = { student: 0, teacher: 0, staff: 0 };
    for (const entry of patientCountDocs) patientsByType[entry._id] = entry.count;
    const totalPatients = patientsByType.student + patientsByType.teacher + patientsByType.staff;

    return {
      totalPatients,
      patientsByType,
      totalStudents: patientsByType.student,
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
      analyticsPatientType,
      analyticsTotalVisits,
      analyticsVisitBreakdown,
      bmiRecordedCount,
      bmiBreakdown,
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
