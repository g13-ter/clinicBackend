import { Request, Response, NextFunction } from "express";
import { ReportService } from "../services/report.service";
import { buildReportDocx } from "../utils/reportDocx";
import { buildAnnualMedicationXls } from "../utils/annualMedicationXls";
import { AppError } from "../middleware/error.middleware";

const reportService = new ReportService();

type VisitReportPeriod = "daily" | "weekly" | "monthly" | "yearly" | "custom";
const visitReportPeriods: readonly VisitReportPeriod[] = ["daily", "weekly", "monthly", "yearly", "custom"];

type ExportType =
  | "inventory-current"
  | "inventory-movements"
  | "inventory-batches"
  | "inventory-reorder"
  | "medication-consumption"
  | "medication-usage-details"
  | "medication-inventory"
  | "inventory-stock"
  | "inventory-usage"
  | "inventory-expiry"
  | "disease-trends"
  | "vaccination-status";

const exportTypes: readonly ExportType[] = [
  "inventory-current",
  "inventory-movements",
  "inventory-batches",
  "inventory-reorder",
  "medication-consumption",
  "medication-usage-details",
  "medication-inventory",
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
    const requestedPeriod = req.query.period as VisitReportPeriod | undefined;
    const period = requestedPeriod && visitReportPeriods.includes(requestedPeriod)
      ? requestedPeriod
      : "custom";
    const buffer = await buildReportDocx(stats, period);
    const filename = `${period === "custom" ? "Clinic" : period[0]!.toUpperCase() + period.slice(1)}_Medical_Case_Report_${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}.docx`;

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

export const getAnnualMedicationReport = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const report = await reportService.getAnnualMedicationReport();
    const buffer = buildAnnualMedicationXls(report);
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Annual_Medication_${report.schoolYear}.xls"`,
    );
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

    if (type === "inventory-current" || type === "inventory-batches") {
      const stock = await reportService.getCurrentStockByBatch();
      const rows = type === "inventory-batches"
        ? [...stock].sort(
            (a, b) =>
              (a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
              (b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER),
          )
        : stock;
      sendCsv(
        res,
        `${type === "inventory-current" ? "Current_Stock" : "Expiry_and_Batch"}_${dateSuffix}.csv`,
        [
          "Medicine",
          "Category",
          "Batch Number",
          "Batch Quantity Remaining",
          "Total Medicine Stock",
          "Unit",
          "Supplier",
          "Date Received",
          "Expiration Date",
          "Status",
        ],
        rows.map((item) => [
          item.medicine,
          item.category,
          item.batchNumber,
          item.quantityRemaining,
          item.totalMedicineStock,
          item.unit,
          item.supplier,
          item.receivedAt,
          item.expiryDate,
          item.status,
        ]),
      );
      return;
    }

    if (type === "inventory-movements") {
      const movements = await reportService.getStockMovementExport(startDate, endDate);
      sendCsv(
        res,
        `Stock_Movement_${dateSuffix}.csv`,
        [
          "Date",
          "Medicine",
          "Transaction Type",
          "Quantity Change",
          "Balance After",
          "Unit",
          "Batch Number",
          "Responsible Staff",
          "Notes",
        ],
        movements.map((item) => [
          item.occurredAt,
          item.medicine,
          item.type,
          item.quantityChange,
          item.balanceAfter,
          item.unit,
          item.batchNumber,
          item.performedBy,
          item.notes,
        ]),
      );
      return;
    }

    if (type === "inventory-reorder") {
      const reorder = await reportService.getReorderExport();
      sendCsv(
        res,
        `Reorder_Report_${dateSuffix}.csv`,
        [
          "Medicine",
          "Category",
          "Current Stock",
          "Unit",
          "Reorder Threshold",
          "Pending Order Quantity",
          "Suggested Order Quantity",
          "Status",
        ],
        reorder.map((item) => [
          item.medicine,
          item.category,
          item.currentStock,
          item.unit,
          item.reorderThreshold,
          item.pendingOrderQuantity,
          item.suggestedOrderQuantity,
          item.status,
        ]),
      );
      return;
    }

    if (type === "medication-consumption") {
      const usage = await reportService.getMedicineUsageExport(startDate, endDate);
      sendCsv(
        res,
        `Medication_Consumption_${dateSuffix}.csv`,
        ["Medication", "Unit", "Quantity Dispensed", "Students / Dispense Transactions"],
        usage.map((item) => [
          item.name,
          item.unit,
          item.quantityDispensed,
          item.dispenseCount,
        ]),
      );
      return;
    }

    if (type === "medication-usage-details") {
      const details = await reportService.getMedicationUsageDetails(startDate, endDate);
      sendCsv(
        res,
        `Medication_Usage_Details_${dateSuffix}.csv`,
        [
          "Date",
          "Student ID",
          "Student",
          "Reason for Visit",
          "Medication",
          "Quantity",
          "Unit",
          "Instructions",
          "Recorded / Dispensed By",
        ],
        details.map((item) => [
          item.dispensedAt,
          item.studentId,
          item.studentName,
          item.complaint,
          item.medicine,
          item.quantity,
          item.unit,
          item.instructions,
          item.recordedBy,
        ]),
      );
      return;
    }

    if (type === "medication-inventory") {
      const medicationReport = await reportService.getMedicationInventoryReport(startDate, endDate);
      sendCsv(
        res,
        `Medication_Inventory_Report_${dateSuffix}.csv`,
        [
          "Name of Medication",
          "Date Medication Received",
          "Total Number Prescribed",
          "Total Remaining Stock On Hand",
          "Expiration Date",
          "Remarks",
        ],
        medicationReport.map((item) => [
          item.name,
          item.dateReceived,
          item.totalPrescribed,
          item.remainingStock,
          item.expirationDate,
          item.remarks,
        ]),
      );
      return;
    }

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
