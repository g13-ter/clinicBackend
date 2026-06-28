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

// Writes one audit log entry. Fire-and-forget on purpose: audit logging
// should never slow down or break the actual request. If writing the log
// fails (DB hiccup, etc.), we record it in the normal app logger and move
// on - we do not want a logging failure to turn into a 500 for the user.
export const logAudit = (params: LogAuditParams): void => {
  const changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } = {};
  if (params.before !== undefined) changes.before = params.before;
  if (params.after !== undefined) changes.after = params.after;

  const metadata: { method?: string; path?: string } = {};
  if (params.method !== undefined) metadata.method = params.method;
  if (params.path !== undefined) metadata.path = params.path;

  AuditLog.create({
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    performedBy: params.performedBy,
    changes,
    metadata,
  }).catch((error) => {
    logger.error(
      `Failed to write audit log (${params.action} ${params.resource} ${params.resourceId}):`,
      error
    );
  });
};