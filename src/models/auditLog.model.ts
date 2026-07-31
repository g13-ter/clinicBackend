import mongoose, { Schema, Document } from "mongoose";

// Append-only history of changes to tracked resources.

export type AuditAction = "create" | "update" | "delete" | "deactivate" | "reactivate" | "view";

export interface IAuditLog extends Document {
  action: AuditAction;
  resource: string;        // e.g. "Patient", "ClinicVisit"
  resourceId: string;      // the _id of the record acted on (string, not ObjectId -
                            // Preserve references to removed records.
  performedBy: mongoose.Types.ObjectId;
  actorSnapshot?: {
    userId: string;
    name: string;
    email: string;
    role: string;
  };
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  metadata?: {
    method?: string;
    path?: string;
  };
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: {
      type: String,
      enum: ["create", "update", "delete", "deactivate", "reactivate", "view"],
      required: true,
      index: true,
    },

    resource: {
      type: String,
      required: true,
      index: true,
    },

    resourceId: {
      type: String,
      required: true,
      index: true,
    },

    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Keep the actor identity immutable even if the live account is later
    // renamed or deleted.
    actorSnapshot: {
      userId: { type: String },
      name: { type: String },
      email: { type: String },
      role: { type: String },
    },

    changes: {
      before: { type: Schema.Types.Mixed },
      after: { type: Schema.Types.Mixed },
    },

    metadata: {
      method: { type: String },
      path: { type: String },
    },
  },
  {
    // Audit entries are immutable.
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const AuditLog = mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);

export default AuditLog;
