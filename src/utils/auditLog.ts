import AuditLog, { AuditAction } from "../models/auditLog.model";
import User from "../models/user.model";
import logger, { errorMetadata } from "./logger";

const CLINICAL_RESOURCES = new Set([
  "Patient",
  "PatientClinicalProfile",
  "ClinicVisit",
  "MedicalHistory",
  "Appointment",
]);

const SECRET_FIELDS = new Set([
  "password",
  "resetPasswordToken",
  "resetPasswordExpires",
  "mfaSecret",
  "mfaRecoveryCodes",
]);

// Audit trails must prove what changed without becoming a second clinical record.
// Clinical values remain in their access-controlled source collections; the audit
// record stores field names only so administrators cannot retrieve PHI through logs.
export const sanitizeAuditSnapshot = (
  resource: string,
  snapshot?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (!snapshot) return undefined;
  if (CLINICAL_RESOURCES.has(resource)) {
    if (Array.isArray(snapshot.changedFields)) {
      return {
        changedFields: snapshot.changedFields.filter((field): field is string => typeof field === "string"),
        ...(snapshot.recordVersion === undefined ? {} : { recordVersion: snapshot.recordVersion }),
      };
    }
    const recordVersion = snapshot.__v;
    return {
      changedFields: Object.keys(snapshot)
        .filter((key) => !["_id", "__v", "createdAt", "updatedAt"].includes(key))
        .sort(),
      ...(recordVersion === undefined ? {} : { recordVersion }),
    };
  }
  return Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => !SECRET_FIELDS.has(key)),
  );
};

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
  const before = sanitizeAuditSnapshot(params.resource, params.before);
  const after = sanitizeAuditSnapshot(params.resource, params.after);
  if (before !== undefined) changes.before = before;
  if (after !== undefined) changes.after = after;

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
