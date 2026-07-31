import Appointment from "../models/appointment.model";
import SystemSettings from "../models/systemSettings.model";
import logger from "../utils/logger";
import { enqueueNotification } from "./notificationOutbox.service";

const REMINDER_HOURS_BEFORE = 3;
const WINDOW_HOURS = 2;
const CLAIM_TTL_MS = 10 * 60 * 1000;
const MAX_REMINDERS_PER_SWEEP = 500;

interface PopulatedPatient {
  firstName: string;
  lastName: string;
  email?: string;
}

interface PopulatedDoctor {
  name?: string;
}

export interface ReminderSweepResult {
  scanned: number;
  sent: number;
  skippedNoEmail: number;
  failed: number;
}

// A short database lease makes the hourly sweep safe across multiple API instances.
export const sendDueReminders = async (): Promise<ReminderSweepResult> => {
  const settings = await SystemSettings.findOne({ key: "clinic" }).lean();
  if (settings && (!settings.emailNotificationsEnabled || !settings.appointmentRemindersEnabled)) {
    return { scanned: 0, sent: 0, skippedNoEmail: 0, failed: 0 };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + (REMINDER_HOURS_BEFORE - WINDOW_HOURS / 2) * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + (REMINDER_HOURS_BEFORE + WINDOW_HOURS / 2) * 60 * 60 * 1000);
  const staleClaim = new Date(now.getTime() - CLAIM_TTL_MS);
  const result: ReminderSweepResult = { scanned: 0, sent: 0, skippedNoEmail: 0, failed: 0 };

  for (let index = 0; index < MAX_REMINDERS_PER_SWEEP; index += 1) {
    const appointment = await Appointment.findOneAndUpdate(
      {
        appointmentDate: { $gte: windowStart, $lte: windowEnd },
        status: { $in: ["pending", "confirmed"] },
        reminderSent: false,
        $or: [
          { reminderClaimedAt: { $exists: false } },
          { reminderClaimedAt: { $lt: staleClaim } },
        ],
      },
      { $set: { reminderClaimedAt: now } },
      { returnDocument: "after", sort: { appointmentDate: 1 } },
    )
      .populate("patientId", "firstName lastName email")
      .populate("doctorId", "name");

    if (!appointment) break;
    result.scanned += 1;

    const patient = appointment.patientId as unknown as PopulatedPatient;
    const doctor = appointment.doctorId as unknown as PopulatedDoctor | undefined;

    try {
      if (!patient?.email) {
        result.skippedNoEmail += 1;
      } else {
        await enqueueNotification({
          kind: "appointment_reminder",
          recipient: patient.email,
          dedupeKey: `appointment-reminder:${appointment._id}:${appointment.appointmentDate.toISOString()}:${patient.email}`,
          payload: {
            appointmentId: String(appointment._id),
            patientName: `${patient.firstName} ${patient.lastName}`,
            appointmentDate: appointment.appointmentDate.toISOString(),
            ...(doctor?.name ? { doctorName: doctor.name } : {}),
          },
        });
        result.sent += 1;
      }

      await Appointment.updateOne(
        { _id: appointment._id, reminderClaimedAt: now },
        { $set: { reminderSent: true }, $unset: { reminderClaimedAt: 1 } },
      );
    } catch (error) {
      result.failed += 1;
      await Appointment.updateOne(
        { _id: appointment._id, reminderClaimedAt: now },
        { $unset: { reminderClaimedAt: 1 } },
      ).catch((releaseError) => {
        logger.error(`Failed to release reminder claim for appointment ${appointment._id}:`, releaseError);
      });
      logger.error(`Failed to send reminder for appointment ${appointment._id}:`, error);
    }
  }

  return result;
};
