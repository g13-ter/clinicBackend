import { Request, Response, NextFunction } from "express";
import { DashboardService } from "../services/dashboard.service";

const dashboardService = new DashboardService();

// GET DASHBOARD STATS — read-only, not audit-logged. Purely aggregate
// counts (no individual patient/medical data), viewable by any
// authenticated role since every role's dashboard draws from this
// same endpoint and just displays a different subset of widgets.
export const getDashboardStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await dashboardService.getStats();
    res.status(200).json({ success: true, message: "Dashboard stats retrieved successfully", data: stats });
  } catch (error) {
    next(error);
  }
};