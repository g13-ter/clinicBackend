import AuditLog, { IAuditLog, AuditAction } from "../models/auditLog.model";
import User from "../models/user.model";
import { PaginationParams } from "../utils/pagination";
import type { UserRole } from "../types/roles";
import { escapeRegex } from "../utils/regex";
import { sanitizeAuditSnapshot } from "../utils/auditLog";

export interface AuditLogFilters {
  resource?: string;
  resourceId?: string;
  action?: AuditAction;
  performedBy?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
}

interface AuditLogQuery {
  resource?: string;
  resourceId?: string;
  action?: AuditAction | { $ne: "view" };
  performedBy?: string;
  createdAt?: { $gte?: Date; $lte?: Date };
  $and?: Array<Record<string, unknown>>;
}

export class AuditLogService {
  async getLogs(
    filters: AuditLogFilters,
    { limit, skip }: PaginationParams,
    viewerRole: UserRole = "admin",
  ): Promise<{
    logs: Array<{
      _id: unknown;
      action: AuditAction;
      resource: string;
      resourceId: string;
      performedBy: { _id: string; name: string; email: string; role: string } | string;
      actorSnapshot?: {
        userId: string;
        name: string;
        email: string;
        role: string;
      };
      changes?: IAuditLog["changes"];
      metadata?: IAuditLog["metadata"];
      createdAt: Date;
    }>;
    total: number;
  }> {
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
    if (filters.startDate || filters.endDate) {
      filter.createdAt = {};
      if (filters.startDate) filter.createdAt.$gte = filters.startDate;
      if (filters.endDate) filter.createdAt.$lte = filters.endDate;
    }
    const protectedConditions: Array<Record<string, unknown>> = [];
    if (viewerRole !== "superadmin") {
      protectedConditions.push(
        { "actorSnapshot.role": { $ne: "superadmin" } },
        { "changes.before.role": { $ne: "superadmin" } },
        { "changes.after.role": { $ne: "superadmin" } },
      );
    }
    if (filters.search?.trim()) {
      const search = new RegExp(escapeRegex(filters.search.trim()), "i");
      protectedConditions.push({
        $or: [
          { resource: search },
          { resourceId: search },
          { "actorSnapshot.name": search },
          { "actorSnapshot.email": search },
        ],
      });
    }
    if (protectedConditions.length > 0) filter.$and = protectedConditions;

    const [rawLogs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    // Resolve live users in one query while retaining the original ObjectId
    // when the referenced account no longer exists.
    const actorIds = [...new Set(rawLogs.map((log) => String(log.performedBy)))];
    const actors = await User.find({ _id: { $in: actorIds } })
      .select("name role email")
      .lean();
    const actorsById = new Map(
      actors.map((actor) => [
        String(actor._id),
        {
          _id: String(actor._id),
          name: actor.name,
          email: actor.email,
          role: actor.role,
        },
      ]),
    );
    const logs = rawLogs.map((log) => {
      const actorId = String(log.performedBy);
      const sanitizedBefore = log.changes?.before
        ? sanitizeAuditSnapshot(log.resource, log.changes.before)
        : undefined;
      const sanitizedAfter = log.changes?.after
        ? sanitizeAuditSnapshot(log.resource, log.changes.after)
        : undefined;
      return {
        ...log,
        ...(log.changes
          ? { changes: {
              ...(sanitizedBefore ? { before: sanitizedBefore } : {}),
              ...(sanitizedAfter ? { after: sanitizedAfter } : {}),
            } }
          : {}),
        performedBy: actorsById.get(actorId) ?? actorId,
      };
    });

    return { logs, total };
  }
}
