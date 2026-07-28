import NotificationOutbox, { type NotificationKind } from "../models/notificationOutbox.model";
import { mailer } from "./mailer.service";
import logger from "../utils/logger";

const CLAIM_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function enqueueNotification(input: {
  kind: NotificationKind;
  recipient: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}): Promise<void> {
  try {
    await NotificationOutbox.create(input);
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) return;
    throw error;
  }
}

const stringValue = (payload: Record<string, unknown>, key: string): string =>
  typeof payload[key] === "string" ? payload[key] : "";
const numberValue = (payload: Record<string, unknown>, key: string): number =>
  typeof payload[key] === "number" ? payload[key] : 0;

async function deliver(kind: NotificationKind, recipient: string, payload: Record<string, unknown>): Promise<boolean> {
  if (kind === "appointment_confirmation") {
    return mailer.sendAppointmentConfirmation({
      to: recipient,
      patientName: stringValue(payload, "patientName"),
      appointmentDate: new Date(stringValue(payload, "appointmentDate")),
      reason: stringValue(payload, "reason"),
      ...(stringValue(payload, "doctorName") ? { doctorName: stringValue(payload, "doctorName") } : {}),
    });
  }
  if (kind === "appointment_reminder") {
    return mailer.sendAppointmentReminder({
      to: recipient,
      patientName: stringValue(payload, "patientName"),
      appointmentDate: new Date(stringValue(payload, "appointmentDate")),
      ...(stringValue(payload, "doctorName") ? { doctorName: stringValue(payload, "doctorName") } : {}),
    });
  }
  if (kind === "low_stock") {
    return mailer.sendLowStockAlert({
      to: recipient,
      itemName: stringValue(payload, "itemName"),
      quantity: numberValue(payload, "quantity"),
      unit: stringValue(payload, "unit"),
      status: stringValue(payload, "status"),
    });
  }
  return mailer.sendPurchaseRequestSubmitted({
    to: recipient,
    itemName: stringValue(payload, "itemName"),
    quantityRequested: numberValue(payload, "quantityRequested"),
    requestedByName: stringValue(payload, "requestedByName"),
    reason: stringValue(payload, "reason"),
  });
}

export async function processNotificationOutbox(limit = 100): Promise<{ processed: number; sent: number; failed: number }> {
  const result = { processed: 0, sent: 0, failed: 0 };
  for (let index = 0; index < limit; index += 1) {
    const now = new Date();
    const stale = new Date(now.getTime() - CLAIM_TTL_MS);
    const item = await NotificationOutbox.findOneAndUpdate(
      {
        status: { $in: ["pending", "processing"] },
        availableAt: { $lte: now },
        attempts: { $lt: MAX_ATTEMPTS },
        $or: [{ claimedAt: { $exists: false } }, { claimedAt: { $lt: stale } }],
      },
      { $set: { status: "processing", claimedAt: now }, $inc: { attempts: 1 } },
      { returnDocument: "after", sort: { availableAt: 1 } },
    );
    if (!item) break;
    result.processed += 1;

    try {
      const sent = await deliver(item.kind, item.recipient, item.payload);
      if (!sent) throw new Error("Email provider did not accept the message");
      await NotificationOutbox.updateOne(
        { _id: item._id, claimedAt: now },
        { $set: { status: "sent", sentAt: new Date() }, $unset: { claimedAt: 1, lastError: 1 } },
      );
      result.sent += 1;
    } catch (error: unknown) {
      const exhausted = item.attempts >= MAX_ATTEMPTS;
      const retryMinutes = Math.min(60, 2 ** item.attempts);
      await NotificationOutbox.updateOne(
        { _id: item._id, claimedAt: now },
        {
          $set: {
            status: exhausted ? "failed" : "pending",
            availableAt: new Date(Date.now() + retryMinutes * 60_000),
            lastError: error instanceof Error ? error.message : "Unknown delivery error",
          },
          $unset: { claimedAt: 1 },
        },
      );
      result.failed += 1;
      logger.error(`Notification delivery failed for ${item._id}:`, error);
    }
  }
  return result;
}
