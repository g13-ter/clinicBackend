import { Request, Response, NextFunction } from "express";
import { AuditLogService, AuditLogFilters } from "../services/auditLog.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { AuditAction } from "../models/auditLog.model";

const auditLogService = new AuditLogService();

// GET ALL (admin only)
// Supports filtering by resource (e.g. "Patient"), resourceId, action
// (create/update/delete/view), and performedBy (a user id).
export const getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pagination = getPaginationParams(req.query);

    const filters: AuditLogFilters = {};

    const resource = req.query.resource as string | undefined;
    const resourceId = req.query.resourceId as string | undefined;
    const action = req.query.action as AuditAction | undefined;
    const performedBy = req.query.performedBy as string | undefined;

    if (resource !== undefined) filters.resource = resource;
    if (resourceId !== undefined) filters.resourceId = resourceId;
    if (action !== undefined) filters.action = action;
    if (performedBy !== undefined) filters.performedBy = performedBy;

    const { logs, total } = await auditLogService.getLogs(filters, pagination);

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