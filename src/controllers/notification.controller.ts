import type { NextFunction, Request, Response } from "express";
import NotificationOutbox from "../models/notificationOutbox.model";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";

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
