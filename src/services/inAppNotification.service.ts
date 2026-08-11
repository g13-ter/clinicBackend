import type { ClientSession } from "mongoose";
import InAppNotification, {
  type IInAppNotification,
  type InAppNotificationKind,
} from "../models/inAppNotification.model";
import User from "../models/user.model";
import { AppError } from "../middleware/error.middleware";
import type { PaginationParams } from "../utils/pagination";

interface CreateNotificationInput {
  userId: string;
  kind: InAppNotificationKind;
  title: string;
  message: string;
  link: string;
  resourceType: "Appointment" | "ClinicVisit";
  resourceId: string;
  dedupeKey: string;
  session?: ClientSession;
}

export async function createInAppNotification(
  input: CreateNotificationInput,
): Promise<void> {
  const { session, ...notification } = input;
  try {
    const item = new InAppNotification(notification);
    await item.save(session ? { session } : undefined);
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return;
    }
    throw error;
  }
}

export async function notifyActiveDoctors(
  input: Omit<CreateNotificationInput, "userId" | "dedupeKey"> & { dedupeKey: string },
): Promise<void> {
  const doctors = await User.find({
    role: "doctor",
    isActive: { $ne: false },
    isAvailable: { $ne: false },
  }).select("_id");

  await Promise.all(
    doctors.map((doctor) =>
      createInAppNotification({
        ...input,
        userId: String(doctor._id),
        dedupeKey: `${input.dedupeKey}:${doctor._id}`,
      }),
    ),
  );
}

export async function getUserNotifications(
  userId: string,
  pagination: PaginationParams,
): Promise<{ items: IInAppNotification[]; total: number; unreadCount: number }> {
  const filter = { userId };
  const [items, total, unreadCount] = await Promise.all([
    InAppNotification.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    InAppNotification.countDocuments(filter),
    InAppNotification.countDocuments({ ...filter, readAt: { $exists: false } }),
  ]);
  return { items, total, unreadCount };
}

export async function markUserNotificationRead(
  userId: string,
  notificationId: string,
): Promise<IInAppNotification> {
  const notification = await InAppNotification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { readAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!notification) throw new AppError("Notification not found", 404);
  return notification;
}

export async function markAllUserNotificationsRead(userId: string): Promise<number> {
  const result = await InAppNotification.updateMany(
    { userId, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount;
}
