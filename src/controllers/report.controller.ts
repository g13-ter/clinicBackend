import { Request, Response, NextFunction } from "express";
import { ReportService } from "../services/report.service";
import { buildReportDocx } from "../utils/reportDocx";
import { AppError } from "../middleware/error.middleware";

const reportService = new ReportService();

type ExportType =
  | "inventory-stock"
  | "inventory-usage"
  | "inventory-expiry"
  | "disease-trends"
  | "vaccination-status";

const exportTypes: readonly ExportType[] = [
  "inventory-stock",
  "inventory-usage",
  "inventory-expiry",
  "disease-trends",
  "vaccination-status",
];

const getDefaultMonthRange = (): { startDate: Date; endDate: Date } => {
  const now = new Date();
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    endDate: now,
  };
};

const getReportRange = (
  startValue?: string,
  endValue?: string,
): { startDate: Date; endDate: Date } => {
  if (!startValue && !endValue) return getDefaultMonthRange();
  if (!startValue || !endValue) {
    throw new AppError("Both startDate and endDate are required for a custom range", 400);
  }

  const startDate = new Date(startValue);
  const endDate = new Date(endValue);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new AppError("startDate and endDate must be valid dates", 400);
  }
  if (startDate > endDate) {
    throw new AppError("startDate must be before endDate", 400);
  }

  // Include the entire selected end date.
  endDate.setUTCHours(23, 59, 59, 999);
  return { startDate, endDate };
};

const csvCell = (value: unknown): string => {
  const text = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value === null || value === undefined
      ? ""
      : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
};

const sendCsv = (
  res: Response,
  filename: string,
  headers: string[],
  rows: unknown[][],
): void => {
  const content = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(`\uFEFF${content}`);
};

export const getClinicSummaryReport = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { startDate, endDate } = getReportRange(
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined,
    );
    const stats = await reportService.getClinicSummary(startDate, endDate);
    const buffer = await buildReportDocx(stats);
    const filename = `Clinic_Report_${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const exportReportCsv = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const type = req.params.type as ExportType;
    if (!exportTypes.includes(type)) {
      throw new AppError("Unsupported report type", 400);
    }

    const { startDate, endDate } = getReportRange(
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined,
    );
    const dateSuffix = `${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}`;

    if (type === "inventory-stock" || type === "inventory-expiry") {
      const inventory = await reportService.getInventoryExport();
      const rows = type === "inventory-expiry"
        ? inventory
          .filter((item) => item.expiryDate)
          .sort((a, b) => (a.expiryDate?.getTime() ?? 0) - (b.expiryDate?.getTime() ?? 0))
        : inventory;
      sendCsv(
        res,
        `${type === "inventory-stock" ? "Inventory_Stock" : "Medicine_Expiry"}_${dateSuffix}.csv`,
        ["Medicine", "Category", "Quantity", "Unit", "Low Stock Threshold", "Expiry Date", "Status"],
        rows.map((item) => [
          item.name,
          item.category,
          item.quantity,
          item.unit,
          item.lowStockThreshold,
          item.expiryDate,
          item.status,
        ]),
      );
      return;
    }

    if (type === "inventory-usage") {
      const usage = await reportService.getMedicineUsageExport(startDate, endDate);
      sendCsv(
        res,
        `Medicine_Usage_${dateSuffix}.csv`,
        ["Medicine", "Unit", "Quantity Dispensed", "Dispense Transactions"],
        usage.map((item) => [
          item.name,
          item.unit,
          item.quantityDispensed,
          item.dispenseCount,
        ]),
      );
      return;
    }

    if (type === "disease-trends") {
      const summary = await reportService.getClinicSummary(startDate, endDate);
      sendCsv(
        res,
        `Disease_Trends_${dateSuffix}.csv`,
        ["Complaint / Condition", "Recorded Visits"],
        summary.complaintCounts.map((item) => [item.complaint, item.count]),
      );
      return;
    }

    const vaccinations = await reportService.getVaccinationExport();
    sendCsv(
      res,
      `Vaccination_Status_${dateSuffix}.csv`,
      ["Student ID", "Student", "Vaccine", "Date Administered", "Notes"],
      vaccinations.map((item) => [
        item.studentId,
        item.studentName,
        item.vaccine,
        item.dateAdministered,
        item.notes,
      ]),
    );
  } catch (error) {
    next(error);
  }
};
