import AuditLog, { IAuditLog, AuditAction } from "../models/auditLog.model";
import { PaginationParams } from "../utils/pagination";

export interface AuditLogFilters {
  resource?: string;
  resourceId?: string;
  action?: AuditAction;
  performedBy?: string;
}

interface AuditLogQuery {
  resource?: string;
  resourceId?: string;
  action?: AuditAction | { $ne: "view" };
  performedBy?: string;
}

export class AuditLogService {
  async getLogs(
    filters: AuditLogFilters,
    { limit, skip }: PaginationParams
  ): Promise<{ logs: IAuditLog[]; total: number }> {
    const filter: AuditLogQuery = {};

    if (filters.resource) filter.resource = filters.resource;
    if (filters.resourceId) filter.resourceId = filters.resourceId;
    if (filters.action) {
      filter.action = filters.action;
    } else {
      // Hide legacy read-access entries — the audit trail is for data changes.
      filter.action = { $ne: "view" };
    }
    if (filters.performedBy) filter.performedBy = filters.performedBy;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("performedBy", "name role email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    return { logs, total };
  }
}
