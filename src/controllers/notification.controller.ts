import type { NextFunction, Request, Response } from "express";
import NotificationOutbox from "../models/notificationOutbox.model";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { getAuthenticatedUser } from "../utils/authUser";
import {
  getUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
} from "../services/inAppNotification.service";

export const getMyNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const pagination = getPaginationParams(req.query);
    const { items, total, unreadCount } = await getUserNotifications(
      getAuthenticatedUser(req).id,
      pagination,
    );
    res.status(200).json({
      success: true,
      message: "Notifications retrieved",
      data: { items, unreadCount },
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};

export const markMyNotificationRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const notification = await markUserNotificationRead(
      getAuthenticatedUser(req).id,
      req.params.id as string,
    );
    res.status(200).json({ success: true, message: "Notification marked as read", data: notification });
  } catch (error) {
    next(error);
  }
};

export const markAllMyNotificationsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const updated = await markAllUserNotificationsRead(getAuthenticatedUser(req).id);
    res.status(200).json({ success: true, message: "Notifications marked as read", data: { updated } });
  } catch (error) {
    next(error);
  }
};

export const getNotificationDeliveryHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const pagination = getPaginationParams(req.query);
    const [items, total] = await Promise.all([
      NotificationOutbox.find()
        .select("-payload")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      NotificationOutbox.countDocuments(),
    ]);
    res.status(200).json({
      success: true,
      message: "Notification delivery history retrieved",
      data: items,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};
