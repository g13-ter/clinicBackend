import { Request, Response, NextFunction } from "express";
import SystemSettings from "../models/systemSettings.model";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { logAudit } from "../utils/auditLog";
import { withMongoTransaction } from "../utils/transaction";

const defaultSchoolYear = (): string => {
  const year = new Date().getFullYear();
  return `${year}-${year + 1}`;
};

const defaults = () => ({
  key: "clinic" as const,
  schoolYear: defaultSchoolYear(),
  clinicOpenTime: "08:00",
  clinicCloseTime: "17:00",
  emailNotificationsEnabled: true,
  appointmentRemindersEnabled: true,
  stockAlertsEnabled: true,
});

export const getSystemSettings = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const settings = await SystemSettings.findOne({ key: "clinic" }).lean();
    res.status(200).json({
      success: true,
      message: "System settings retrieved successfully",
      data: settings ?? defaults(),
    });
  } catch (error) {
    next(error);
  }
};

export const updateSystemSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const performedBy = getAuthenticatedUser(req).id;
    const after = await withMongoTransaction(async (session) => {
      const beforeQuery = SystemSettings.findOne({ key: "clinic" }).lean();
      if (session) beforeQuery.session(session);
      const before = await beforeQuery;
      const afterValue = await SystemSettings.findOneAndUpdate(
        { key: "clinic" },
        {
          $set: {
            ...req.body,
            updatedBy: getAuthenticatedObjectId(req),
          },
          $setOnInsert: { key: "clinic" },
        },
        { returnDocument: "after", upsert: true, runValidators: true, ...(session ? { session } : {}) },
      ).lean();

      await logAudit({
        action: "update",
        resource: "SystemSettings",
        resourceId: "clinic",
        performedBy,
        before: (before ?? defaults()) as unknown as Record<string, unknown>,
        after: afterValue as unknown as Record<string, unknown>,
        method: req.method,
        path: req.originalUrl,
        ...(session ? { session } : {}),
        required: true,
      });
      return afterValue;
    });

    res.status(200).json({
      success: true,
      message: "System settings updated successfully",
      data: after,
    });
  } catch (error) {
    next(error);
  }
};
