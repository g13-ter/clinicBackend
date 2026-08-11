import type { NextFunction, Request, Response } from "express";
import { Resend } from "resend";
import NotificationOutbox from "../models/notificationOutbox.model";
import { AppError } from "../middleware/error.middleware";

const DELIVERY_EVENTS = {
  "email.sent": { status: "sent", rank: 1 },
  "email.delivery_delayed": { status: "delayed", rank: 2 },
  "email.delivered": { status: "delivered", rank: 3 },
  "email.bounced": { status: "bounced", rank: 4 },
  "email.failed": { status: "failed", rank: 4 },
  "email.complained": { status: "complained", rank: 4 },
  "email.suppressed": { status: "suppressed", rank: 4 },
} as const;

export const handleResendWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) throw new AppError("Email webhook is not configured", 503);
    if (!Buffer.isBuffer(req.body)) throw new AppError("Invalid webhook payload", 400);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const event = resend.webhooks.verify({
      payload: req.body.toString("utf8"),
      headers: {
        id: req.get("svix-id") || "",
        timestamp: req.get("svix-timestamp") || "",
        signature: req.get("svix-signature") || "",
      },
      webhookSecret,
    });
    const delivery = DELIVERY_EVENTS[event.type as keyof typeof DELIVERY_EVENTS];
    if (!delivery || !("email_id" in event.data)) {
      res.status(200).json({ success: true, message: "Webhook ignored" });
      return;
    }

    await NotificationOutbox.updateOne(
      { providerMessageId: event.data.email_id, deliveryRank: { $lte: delivery.rank } },
      {
        $set: {
          deliveryStatus: delivery.status,
          deliveryRank: delivery.rank,
          deliveryUpdatedAt: new Date(event.created_at),
        },
      },
    );
    res.status(200).json({ success: true, message: "Webhook processed" });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError("Invalid webhook signature", 400));
  }
};
