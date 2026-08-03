import AuditLog, { AuditAction } from "../models/auditLog.model";
import User from "../models/user.model";
import logger, { errorMetadata } from "./logger";

interface LogAuditParams {
  action: AuditAction;
  resource: string;
  resourceId: string;
  performedBy: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  method?: string;
  path?: string;
}

// Record data changes without allowing audit failures to fail the request.
export const logAudit = async (params: LogAuditParams): Promise<void> => {
  const changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } = {};
  if (params.before !== undefined) changes.before = params.before;
  if (params.after !== undefined) changes.after = params.after;

  const metadata: { method?: string; path?: string } = {};
  if (params.method !== undefined) metadata.method = params.method;
  if (params.path !== undefined) metadata.path = params.path;

  try {
    const actor = await User.findById(params.performedBy)
      .select("name email role")
      .lean();

    await AuditLog.create({
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      performedBy: params.performedBy,
      actorSnapshot: actor
        ? {
            userId: String(actor._id),
            name: actor.name,
            email: actor.email,
            role: actor.role,
          }
        : {
            userId: params.performedBy,
            name: "Former account",
            email: "",
            role: "unknown",
          },
      changes,
      metadata,
    });
  } catch (error) {
    logger.error("audit_log_write_failed", {
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      ...errorMetadata(error),
    });
  }
};
