import { Request, Response, NextFunction } from "express";
import { AuditLogService, AuditLogFilters } from "../services/auditLog.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { AuditAction } from "../models/auditLog.model";
import { getAuthenticatedUser } from "../utils/authUser";

const auditLogService = new AuditLogService();

// GET ALL — filterable; legacy view entries are opt-in
export const getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pagination = getPaginationParams(req.query);

    const filters: AuditLogFilters = {};

    const resource = req.query.resource as string | undefined;
    const resourceId = req.query.resourceId as string | undefined;
    const action = req.query.action as AuditAction | undefined;
    const performedBy = req.query.performedBy as string | undefined;
    const search = req.query.search as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    if (resource !== undefined) filters.resource = resource;
    if (resourceId !== undefined) filters.resourceId = resourceId;
    if (action !== undefined) filters.action = action;
    if (performedBy !== undefined) filters.performedBy = performedBy;
    if (search !== undefined) filters.search = search;
    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) filters.startDate = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) filters.endDate = new Date(`${endDate}T23:59:59.999Z`);

    const { logs, total } = await auditLogService.getLogs(filters, pagination, getAuthenticatedUser(req).role);

    res.status(200).json({
      success: true,
      message: "Audit logs retrieved successfully",
      data: logs,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};
