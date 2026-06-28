import mongoose, { Schema, Document } from "mongoose";

// Permanent record of every action taken on tracked resources.
// Unlike createdBy/updatedBy on individual records (which only show the
// MOST RECENT change), this collection never gets edited or deleted -
// it's a full history of who did what, to which record, and when.

export type AuditAction = "create" | "update" | "delete" | "view";

export interface IAuditLog extends Document {
  action: AuditAction;
  resource: string;        // e.g. "Patient", "ClinicVisit"
  resourceId: string;      // the _id of the record acted on (string, not ObjectId -
                            // a deleted/archived record's id should still be readable
                            // in old logs even if the record itself is gone)
  performedBy: mongoose.Types.ObjectId;
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
      enum: ["create", "update", "delete", "view"],
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
    // only createdAt - there is intentionally no updatedAt.
    // Audit entries are write-once and never modified after creation.
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const AuditLog = mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);

export default AuditLog;