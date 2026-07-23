import { Request, Response, NextFunction } from "express";
import analyticsService from "../services/analytics.service";
import { AppError } from "../middleware/error.middleware";

export const getMonthlyVisits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const months = Number(req.query.months) || 4;
    if (months <= 0 || months > 24) throw new AppError("months must be between 1 and 24", 400);

    const data = await analyticsService.getMonthlyVisits(months);
    res.json({ success: true, message: "Monthly visits", data });
  } catch (err) {
    next(err);
  }
};

export const getComplaints = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let startDate: Date;
    let endDate: Date;

    if (req.query.startDate || req.query.endDate) {
      if (!req.query.startDate || !req.query.endDate) throw new AppError("Both startDate and endDate are required", 400);
      startDate = new Date(req.query.startDate as string);
      endDate = new Date(req.query.endDate as string);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new AppError("Invalid dates", 400);
    } else {
      // default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
    }

    const data = await analyticsService.getComplaintCounts(startDate, endDate);
    res.json({ success: true, message: "Complaint counts", data });
  } catch (err) {
    next(err);
  }
};
