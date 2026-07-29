import NotificationOutbox, { type NotificationKind } from "../models/notificationOutbox.model";
import { mailer } from "./mailer.service";
import logger from "../utils/logger";
import Appointment from "../models/appointment.model";
import type { ClientSession } from "mongoose";

const CLAIM_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function enqueueNotification(input: {
  kind: NotificationKind;
  recipient: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  session?: ClientSession;
}): Promise<void> {
  try {
    const { session, ...notification } = input;
    const item = new NotificationOutbox(notification);
    await item.save(session ? { session } : undefined);
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
  if (kind === "appointment_doctor_confirmed") {
    return mailer.sendAppointmentDoctorConfirmed({
      to: recipient,
      patientName: stringValue(payload, "patientName"),
      appointmentDate: new Date(stringValue(payload, "appointmentDate")),
      ...(stringValue(payload, "doctorName") ? { doctorName: stringValue(payload, "doctorName") } : {}),
    });
  }
  if (kind === "appointment_rescheduled") {
    return mailer.sendAppointmentRescheduled({
      to: recipient,
      patientName: stringValue(payload, "patientName"),
      previousDate: new Date(stringValue(payload, "previousDate")),
      appointmentDate: new Date(stringValue(payload, "appointmentDate")),
      reason: stringValue(payload, "reason"),
      ...(stringValue(payload, "doctorName") ? { doctorName: stringValue(payload, "doctorName") } : {}),
    });
  }
  if (kind === "appointment_cancelled") {
    return mailer.sendAppointmentCancelled({
      to: recipient,
      patientName: stringValue(payload, "patientName"),
      appointmentDate: new Date(stringValue(payload, "appointmentDate")),
      reason: stringValue(payload, "reason"),
      cancellationReason: stringValue(payload, "cancellationReason"),
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

const appointmentKinds = new Set<NotificationKind>([
  "appointment_confirmation",
  "appointment_doctor_confirmed",
  "appointment_rescheduled",
  "appointment_cancelled",
  "appointment_reminder",
]);

async function staleAppointmentNotification(
  kind: NotificationKind,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!appointmentKinds.has(kind)) return false;
  const appointmentId = stringValue(payload, "appointmentId");
  // Legacy messages without an appointment ID cannot be checked safely.
  if (!appointmentId) return false;

  const appointment = await Appointment.findById(appointmentId)
    .select("appointmentDate status")
    .lean();
  if (!appointment) return true;

  if (kind === "appointment_cancelled") {
    return appointment.status !== "cancelled";
  }
  if (appointment.status === "cancelled" || appointment.status === "completed") {
    return true;
  }

  const payloadDate = stringValue(payload, "appointmentDate");
  return Boolean(
    payloadDate &&
    appointment.appointmentDate.toISOString() !== new Date(payloadDate).toISOString()
  );
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
      if (await staleAppointmentNotification(item.kind, item.payload)) {
        await NotificationOutbox.updateOne(
          { _id: item._id, claimedAt: now },
          {
            $set: {
              status: "discarded",
              lastError: "Superseded by a newer appointment status or schedule",
            },
            $unset: { claimedAt: 1 },
          },
        );
        continue;
      }

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
