import { Request, Response, NextFunction } from "express";
import { ReportService } from "../services/report.service";
import { buildReportDocx } from "../utils/reportDocx";
import { AppError } from "../middleware/error.middleware";

const reportService = new ReportService();

// Returns the START of the current calendar month and the current
// moment, used as the default range when no dates are given.
const getDefaultMonthRange = (): { startDate: Date; endDate: Date } => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate, endDate: now };
};

// GET /api/reports/clinic-summary?startDate=...&endDate=...
// Admin only. Generates a Word document summarizing clinic activity
// for the given date range (defaults to the current month if no dates
// are provided). The report is built entirely from data already in
// this system - no external AI call, so this responds in milliseconds.
export const getClinicSummaryReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let startDate: Date;
    let endDate: Date;

    if (req.query.startDate || req.query.endDate) {
      if (!req.query.startDate || !req.query.endDate) {
        throw new AppError("Both startDate and endDate are required when specifying a custom range", 400);
      }

      startDate = new Date(req.query.startDate as string);
      endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new AppError("startDate and endDate must be valid dates", 400);
      }
    } else {
      const defaultRange = getDefaultMonthRange();
      startDate = defaultRange.startDate;
      endDate = defaultRange.endDate;
    }

    const stats = await reportService.getClinicSummary(startDate, endDate);
    const buffer = await buildReportDocx(stats);

    const filename = `Clinic_Report_${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};