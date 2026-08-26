import { Request, Response, NextFunction } from "express";
import { DashboardService } from "../services/dashboard.service";
import type { AnalyticsPatientType, AnalyticsPeriod, AnalyticsRange } from "../services/dashboard.service";
import { getAuthenticatedUser } from "../utils/authUser";
import { AppError } from "../middleware/error.middleware";
import { clinicDateKey, clinicDayRange } from "../utils/clinicTime";

const dashboardService = new DashboardService();

const dateKey = (value: unknown, fallback: string): string => {
  const key = typeof value === "string" ? value : fallback;
  try {
    clinicDayRange(key);
    return key;
  } catch {
    throw new AppError("Dates must use a valid YYYY-MM-DD value", 400);
  }
};

const shiftDateKey = (key: string, days: number): string => {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const analyticsRange = (query: Request["query"]): AnalyticsRange => {
  const requestedPeriod = typeof query.period === "string" ? query.period : "month";
  if (!["year", "month", "week", "day", "custom"].includes(requestedPeriod)) {
    throw new AppError("period must be year, month, week, day, or custom", 400);
  }
  const period = requestedPeriod as AnalyticsPeriod;
  const selected = dateKey(query.date, clinicDateKey());
  let startKey = selected;
  let endKey = selected;

  if (period === "year") {
    startKey = `${selected.slice(0, 4)}-01-01`;
    endKey = `${selected.slice(0, 4)}-12-31`;
  } else if (period === "month") {
    startKey = `${selected.slice(0, 7)}-01`;
    const nextMonth = new Date(`${startKey}T00:00:00.000Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    endKey = shiftDateKey(nextMonth.toISOString().slice(0, 10), -1);
  } else if (period === "week") {
    const selectedDate = new Date(`${selected}T00:00:00.000Z`);
    const daysSinceMonday = (selectedDate.getUTCDay() + 6) % 7;
    startKey = shiftDateKey(selected, -daysSinceMonday);
    endKey = shiftDateKey(startKey, 6);
  } else if (period === "custom") {
    startKey = dateKey(query.start, selected);
    endKey = dateKey(query.end, selected);
    if (endKey < startKey) throw new AppError("Custom end date must be on or after the start date", 400);
    const days = (Date.parse(endKey) - Date.parse(startKey)) / 86_400_000;
    if (days > 366) throw new AppError("Custom analytics ranges cannot exceed 367 days", 400);
  }

  return {
    period,
    startKey,
    endKey,
    start: clinicDayRange(startKey).start,
    endExclusive: clinicDayRange(endKey).endExclusive,
  };
};

// GET DASHBOARD STATS — shared aggregate data, not audit-logged
export const getDashboardStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const actor = getAuthenticatedUser(req);
    const stats = await dashboardService.getStats(
      actor.role === "doctor" ? actor.id : undefined,
    );
    const operationalStats = { ...stats } as Record<string, unknown>;
    delete operationalStats.commonComplaints;
    delete operationalStats.monthlyVisits;
    delete operationalStats.analyticsPatientType;
    delete operationalStats.analyticsTotalVisits;
    delete operationalStats.analyticsVisitBreakdown;
    delete operationalStats.bmiRecordedCount;
    delete operationalStats.bmiBreakdown;
    if (actor.role === "admin" || actor.role === "staff") {
      // Non-clinical dashboards receive only operational workload data, not analytics or inventory data.
      stats.recentCases = [];
      stats.commonComplaints = [];
      stats.monthlyVisits = [];
      stats.monthlyConsultations = 0;
      stats.lowStockCount = 0;
      stats.outOfStockCount = 0;
      stats.expiredCount = 0;
      delete operationalStats.recentCases;
    }
    res.status(200).json({ success: true, message: "Dashboard stats retrieved successfully", data: operationalStats });
  } catch (error) {
    next(error);
  }
};

export const getSuperAdminDashboard = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const summary = await dashboardService.getSuperAdminSummary();
    res.status(200).json({ success: true, message: "Super Admin dashboard retrieved successfully", data: summary });
  } catch (error) {
    next(error);
  }
};

export const getAnalyticsStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Analytics changes whenever a clinical visit is saved; prevent browsers and
    // deployment proxies from serving a stale pre-save snapshot.
    res.set("Cache-Control", "no-store");
    const requestedType = (req.query.patientType ?? "all") as string;
    if (!["all", "student", "teacher", "staff"].includes(requestedType)) {
      throw new AppError("patientType must be all, student, teacher, or staff", 400);
    }
    const stats = await dashboardService.getAnalytics(
      requestedType as AnalyticsPatientType,
      analyticsRange(req.query),
    );
    res.status(200).json({ success: true, message: "Analytics retrieved successfully", data: stats });
  } catch (error) {
    next(error);
  }
};
