import { Request, Response, NextFunction } from "express";
import { DashboardService } from "../services/dashboard.service";
import type { AnalyticsPatientType } from "../services/dashboard.service";
import { getAuthenticatedUser } from "../utils/authUser";
import { AppError } from "../middleware/error.middleware";

const dashboardService = new DashboardService();

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

export const getAnalyticsStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const requestedType = (req.query.patientType ?? "all") as string;
    if (!["all", "student", "teacher", "staff"].includes(requestedType)) {
      throw new AppError("patientType must be all, student, teacher, or staff", 400);
    }
    const actor = getAuthenticatedUser(req);
    const stats = await dashboardService.getStats(
      actor.role === "doctor" ? actor.id : undefined,
      requestedType as AnalyticsPatientType,
    );
    res.status(200).json({ success: true, message: "Analytics retrieved successfully", data: stats });
  } catch (error) {
    next(error);
  }
};
