import Appointment from "../models/appointment.model";
import logger from "../utils/logger";
import { mailer } from "./mailer.service";

// How far ahead of an appointment to send the reminder, and how wide a
// window to scan each sweep. The sweep is meant to run roughly hourly
// (see server.ts's node-cron job, or an external cron hitting the
// internal route), so a 2-hour window comfortably catches every
// appointment as it crosses the 3h-out mark without needing
// second-level precision.
const REMINDER_HOURS_BEFORE = 3;
const WINDOW_HOURS = 2;

// The earliest point (hours-out) the hourly sweep's window covers. Any
// appointment booked for LESS time out than this will never be caught by
// sendDueReminders - by the time the sweep runs, it'll already be closer
// than the window's near edge. createAppointment calls
// sendImmediateReminderIfLateBooking right after booking to cover that gap.
const WINDOW_START_HOURS = REMINDER_HOURS_BEFORE - WINDOW_HOURS / 2;

export interface ReminderSweepResult {
  scanned: number;
  sent: number;
  skippedNoEmail: number;
  failed: number;
}

// Finds appointments that are ~3h away, haven't been reminded yet, and
// are still pending/confirmed (not cancelled/completed), then sends a
// reminder email to each patient that has one on file. Every matching
// appointment is marked reminderSent=true after processing - including
// patients with no email - so the sweep never reprocesses the same
// appointment on the next run.
export const sendDueReminders = async (): Promise<ReminderSweepResult> => {
  const now = new Date();
  const windowStart = new Date(now.getTime() + (REMINDER_HOURS_BEFORE - WINDOW_HOURS / 2) * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + (REMINDER_HOURS_BEFORE + WINDOW_HOURS / 2) * 60 * 60 * 1000);

  const appointments = await Appointment.find({
    appointmentDate: { $gte: windowStart, $lte: windowEnd },
    status: { $in: ["pending", "confirmed"] },
    reminderSent: false,
  })
    .populate("patientId", "firstName lastName email")
    .populate("doctorId", "name");

  const result: ReminderSweepResult = { scanned: appointments.length, sent: 0, skippedNoEmail: 0, failed: 0 };

  for (const appointment of appointments) {
    const patient = appointment.patientId as any;
    const doctor = appointment.doctorId as any;

    try {
      if (patient?.email) {
        await mailer.sendAppointmentReminder({
          to: patient.email,
          patientName: `${patient.firstName} ${patient.lastName}`,
          appointmentDate: appointment.appointmentDate,
          ...(doctor?.name ? { doctorName: doctor.name } : {}),
        });
        result.sent += 1;
      } else {
        result.skippedNoEmail += 1;
      }

      appointment.reminderSent = true;
      await appointment.save();
    } catch (error) {
      result.failed += 1;
      logger.error(`Failed to send reminder for appointment ${appointment._id}:`, error);
    }
  }

  return result;
};

// Called once, right after an appointment is booked. If the appointment is
// already closer than WINDOW_START_HOURS away, the hourly sweep will never
// catch it (see the constant's comment above), so send the reminder right
// now instead. Does nothing for appointments booked further out - those
// are left for sendDueReminders to handle as normal.
export const sendImmediateReminderIfLateBooking = async (appointmentId: string): Promise<void> => {
  const appointment = await Appointment.findById(appointmentId)
    .populate("patientId", "firstName lastName email")
    .populate("doctorId", "name");

  if (!appointment || appointment.reminderSent) return;
  if (!["pending", "confirmed"].includes(appointment.status)) return;

  const hoursUntilAppointment = (appointment.appointmentDate.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilAppointment <= 0 || hoursUntilAppointment >= WINDOW_START_HOURS) return;

  const patient = appointment.patientId as any;
  const doctor = appointment.doctorId as any;

  try {
    if (patient?.email) {
      await mailer.sendAppointmentReminder({
        to: patient.email,
        patientName: `${patient.firstName} ${patient.lastName}`,
        appointmentDate: appointment.appointmentDate,
        ...(doctor?.name ? { doctorName: doctor.name } : {}),
      });
    }

    appointment.reminderSent = true;
    await appointment.save();
  } catch (error) {
    logger.error(`Failed to send immediate reminder for late-booked appointment ${appointment._id}:`, error);
  }
};