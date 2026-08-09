import { NextFunction, Request, Response } from "express";
import { MonthlyInventoryService } from "../services/monthlyInventory.service";
import { getAuthenticatedUser } from "../utils/authUser";
import { logAudit } from "../utils/auditLog";
import { AppError } from "../middleware/error.middleware";

const service = new MonthlyInventoryService();

const csvCell = (value: unknown): string => {
  const text = value instanceof Date
    ? value.toISOString()
    : value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const listMonthlyInventoryReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reports = await service.list(getAuthenticatedUser(req).role);
    res.json({ success: true, message: "Monthly inventory reports retrieved successfully", data: reports });
  } catch (error) { next(error); }
};

export const openMonthlyInventoryDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const report = await service.openDraft(Number(req.body.year), Number(req.body.month), user.id);
    await logAudit({ action: "create", resource: "MonthlyInventoryReport", resourceId: String(report._id), performedBy: user.id, after: report.toObject(), method: req.method, path: req.originalUrl });
    res.status(report.status === "draft" ? 201 : 200).json({ success: true, message: "Monthly inventory report opened successfully", data: report });
  } catch (error) { next(error); }
};

export const getMonthlyInventoryReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const report = await service.getById(req.params.id as string, getAuthenticatedUser(req).role);
    res.json({ success: true, message: "Monthly inventory report retrieved successfully", data: report });
  } catch (error) { next(error); }
};

export const saveMonthlyInventoryDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const report = await service.saveDraft(req.params.id as string, req.body.items);
    await logAudit({ action: "update", resource: "MonthlyInventoryReport", resourceId: String(report._id), performedBy: user.id, after: report.toObject(), method: req.method, path: req.originalUrl });
    res.json({ success: true, message: "Monthly inventory reconciliation saved", data: report });
  } catch (error) { next(error); }
};

export const finalizeMonthlyInventoryReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const report = await service.finalize(req.params.id as string, user.id);
    await logAudit({ action: "update", resource: "MonthlyInventoryReport", resourceId: String(report._id), performedBy: user.id, after: report.toObject(), method: req.method, path: req.originalUrl });
    res.json({ success: true, message: "Monthly inventory report finalized", data: report });
  } catch (error) { next(error); }
};

export const exportMonthlyInventoryReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const report = await service.getById(req.params.id as string, user.role);
    if (report.status !== "finalized") throw new AppError("Only finalized monthly inventory reports can be exported", 409);
    const headers = [
      "School / Clinic", "Reporting Month", "Medicine", "Category", "Unit", "Beginning Balance", "Received",
      "Dispensed", "Adjustments", "Damaged/Lost/Expired", "Calculated Ending", "Physical Count",
      "Variance", "Variance Notes", "Batch Numbers", "Expiration Dates", "Availability", "Low Stock",
      "Reorder Required", "Prepared By", "Finalized By", "Finalized At", "Exported At",
    ];
    const preparedBy = report.preparedBy && typeof report.preparedBy === "object" && "name" in report.preparedBy
      ? String((report.preparedBy as unknown as { name: string }).name) : "";
    const finalizedBy = report.finalizedBy && typeof report.finalizedBy === "object" && "name" in report.finalizedBy
      ? String((report.finalizedBy as unknown as { name: string }).name) : "";
    const clinicName = process.env.CLINIC_NAME?.trim() || "School Clinic";
    const rows = report.items.map((item) => [
      clinicName, `${String(report.month).padStart(2, "0")}/${report.year}`, item.medicineName, item.category, item.unit,
      item.beginningBalance, item.receivedQuantity, item.dispensedQuantity, item.adjustmentQuantity,
      item.damagedLostExpiredQuantity, item.calculatedEndingBalance, item.physicalCount, item.variance,
      item.varianceNotes, item.batches.map((batch) => batch.batchNumber).join("; "),
      item.batches.map((batch) => batch.expirationDate?.toISOString().slice(0, 10) ?? "").filter(Boolean).join("; "),
      item.availabilityStatus, item.isLowStock ? "Yes" : "No", item.reorderRequired ? "Yes" : "No",
      preparedBy, finalizedBy, report.finalizedAt, new Date(),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Monthly_Inventory_${report.year}_${String(report.month).padStart(2, "0")}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) { next(error); }
};
