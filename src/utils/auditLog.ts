import AuditLog, { AuditAction } from "../models/auditLog.model";
import logger from "./logger";

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
    await AuditLog.create({
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      performedBy: params.performedBy,
      changes,
      metadata,
    });
  } catch (error) {
    logger.error(
      `Failed to write audit log (${params.action} ${params.resource} ${params.resourceId}):`,
      error
    );
  }
};
