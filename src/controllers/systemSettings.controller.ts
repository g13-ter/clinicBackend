import { Request, Response, NextFunction } from "express";
import SystemSettings, { DEFAULT_CLINIC_PROFILE, type ClinicScheduleDay } from "../models/systemSettings.model";
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
  ...DEFAULT_CLINIC_PROFILE,
  emailNotificationsEnabled: true,
  appointmentRemindersEnabled: true,
  stockAlertsEnabled: true,
});

type ClinicProfileSource = Partial<{
  clinicName: string;
  buildingLocation: string;
  floorRoom: string;
  operatingDays: string;
  clinicOpenTime: string;
  clinicCloseTime: string;
  weeklySchedule: ClinicScheduleDay[];
  phoneNumber: string;
  emailAddress: string;
}>;

const weekdays: ClinicScheduleDay["day"][] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const scheduleFromLegacy = (days: string, openTime: string, closeTime: string): ClinicScheduleDay[] => {
  const normalized = days.replace(/[–—]/g, "-");
  const range = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*-\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.exec(normalized);
  let selected = weekdays.filter((day) => new RegExp(`\\b${day}\\b`, "i").test(normalized));
  if (range) {
    const start = weekdays.findIndex((day) => day.toLowerCase() === range[1]!.toLowerCase());
    const end = weekdays.findIndex((day) => day.toLowerCase() === range[2]!.toLowerCase());
    if (start >= 0 && end >= start) selected = weekdays.slice(start, end + 1);
  }
  return (selected.length ? selected : weekdays.slice(0, 5)).map((day) => ({ day, openTime, closeTime }));
};

const clinicProfile = (settings: ClinicProfileSource) => {
  const fallback = defaults();
  const operatingDays = settings.operatingDays ?? fallback.operatingDays;
  const clinicOpenTime = settings.clinicOpenTime ?? fallback.clinicOpenTime;
  const clinicCloseTime = settings.clinicCloseTime ?? fallback.clinicCloseTime;
  const weeklySchedule = Array.isArray(settings.weeklySchedule) && settings.weeklySchedule.length > 0
    ? settings.weeklySchedule
    : scheduleFromLegacy(operatingDays, clinicOpenTime, clinicCloseTime);
  return {
    clinicName: settings.clinicName ?? fallback.clinicName,
    buildingLocation: settings.buildingLocation ?? fallback.buildingLocation,
    floorRoom: settings.floorRoom ?? fallback.floorRoom,
    operatingDays,
    clinicOpenTime,
    clinicCloseTime,
    weeklySchedule,
    phoneNumber: settings.phoneNumber ?? fallback.phoneNumber,
    emailAddress: settings.emailAddress ?? fallback.emailAddress,
  };
};

export const getClinicProfile = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const settings = await SystemSettings.findOne({ key: "clinic" })
      .select("clinicName buildingLocation floorRoom operatingDays clinicOpenTime clinicCloseTime weeklySchedule phoneNumber emailAddress -_id")
      .lean();
    res.status(200).json({
      success: true,
      message: "Clinic profile retrieved successfully",
      data: clinicProfile(settings ?? defaults()),
    });
  } catch (error) {
    next(error);
  }
};

export const updateClinicProfile = async (
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
          $set: { ...req.body, updatedBy: getAuthenticatedObjectId(req) },
          $setOnInsert: {
            key: "clinic",
            schoolYear: defaultSchoolYear(),
            emailNotificationsEnabled: true,
            appointmentRemindersEnabled: true,
            stockAlertsEnabled: true,
          },
        },
        { returnDocument: "after", upsert: true, runValidators: true, ...(session ? { session } : {}) },
      ).lean();

      await logAudit({
        action: "update",
        resource: "SystemSettings",
        resourceId: "clinic-profile",
        performedBy,
        before: clinicProfile(before ?? defaults()) as Record<string, unknown>,
        after: clinicProfile(afterValue ?? defaults()) as Record<string, unknown>,
        method: req.method,
        path: req.originalUrl,
        ...(session ? { session } : {}),
        required: true,
      });
      return afterValue;
    });

    res.status(200).json({
      success: true,
      message: "Clinic information saved successfully",
      data: clinicProfile(after ?? defaults()),
    });
  } catch (error) {
    next(error);
  }
};

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
      data: { ...defaults(), ...(settings ?? {}) },
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
