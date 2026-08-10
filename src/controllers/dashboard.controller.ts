import { Request, Response, NextFunction } from "express";
import { DashboardService } from "../services/dashboard.service";
import { getAuthenticatedUser } from "../utils/authUser";

const dashboardService = new DashboardService();

// GET DASHBOARD STATS — shared aggregate data, not audit-logged
export const getDashboardStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const actor = getAuthenticatedUser(req);
    const stats = await dashboardService.getStats(
      actor.role === "doctor" ? actor.id : undefined,
    );
    if (actor.role === "admin" || actor.role === "staff") {
      // Non-clinical dashboards receive only operational workload data, not analytics or inventory data.
      stats.recentCases = [];
      stats.commonComplaints = [];
      stats.monthlyVisits = [];
      stats.monthlyConsultations = 0;
      stats.lowStockCount = 0;
      stats.outOfStockCount = 0;
      stats.expiredCount = 0;
    }
    res.status(200).json({ success: true, message: "Dashboard stats retrieved successfully", data: stats });
  } catch (error) {
    next(error);
  }
};
