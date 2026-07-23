import { Resend } from "resend";
import logger from "../utils/logger";

// RESEND_API_KEY is optional. If it's not set (e.g. local dev, or a
// deployment that hasn't wired up email yet), every send* call below
// logs what WOULD have been sent and returns successfully instead of
// throwing - so the rest of the app (appointments, inventory, purchase
// requests) keeps working exactly as before with email simply "off".
const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || "School Clinic <clinic@resend.dev>";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

// Every email in this app goes through this one function, fire-and-forget
// style from the caller's perspective - callers should NOT await this in
// a way that blocks the HTTP response, and should never let an email
// failure turn into a failed API request (booking an appointment must
// still succeed even if the confirmation email fails to send).
const sendEmail = async ({ to, subject, html }: SendEmailParams): Promise<void> => {
  if (!resend) {
    logger.info(`[mailer] RESEND_API_KEY not set - skipping email. Would have sent "${subject}" to ${to}`);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error(`[mailer] Resend rejected email "${subject}" to ${to}:`, error);
    }
  } catch (error) {
    logger.error(`[mailer] Failed to send email "${subject}" to ${to}:`, error);
  }
};

// Shared wrapper: wraps date formatting once so every template renders
// dates/times consistently.
const formatDateTime = (date: Date): string =>
  new Date(date).toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

const emailWrapper = (title: string, bodyHtml: string): string => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
    <div style="background-color: #2563eb; padding: 20px; border-radius: 8px 8px 0 0;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">School Clinic</h1>
    </div>
    <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
      <h2 style="font-size: 16px; margin-top: 0;">${title}</h2>
      ${bodyHtml}
    </div>
  </div>
`;

export const mailer = {
  sendAppointmentConfirmation: (params: {
    to: string;
    patientName: string;
    appointmentDate: Date;
    doctorName?: string;
    reason: string;
  }): Promise<void> =>
    sendEmail({
      to: params.to,
      subject: "Appointment Confirmed - School Clinic",
      html: emailWrapper(
        "Your appointment is confirmed",
        `
          <p>Hi ${params.patientName},</p>
          <p>Your clinic appointment has been booked:</p>
          <ul>
            <li><strong>Date &amp; time:</strong> ${formatDateTime(params.appointmentDate)}</li>
            ${params.doctorName ? `<li><strong>Doctor:</strong> ${params.doctorName}</li>` : ""}
            <li><strong>Reason:</strong> ${params.reason}</li>
          </ul>
          <p>Please arrive a few minutes early. If you need to reschedule, contact the clinic directly.</p>
        `
      ),
    }),

  sendAppointmentReminder: (params: {
    to: string;
    patientName: string;
    appointmentDate: Date;
    doctorName?: string;
  }): Promise<void> =>
    sendEmail({
      to: params.to,
      subject: "Reminder: Appointment Tomorrow - School Clinic",
      html: emailWrapper(
        "Your appointment is tomorrow",
        `
          <p>Hi ${params.patientName},</p>
          <p>This is a reminder that you have a clinic appointment coming up:</p>
          <ul>
            <li><strong>Date &amp; time:</strong> ${formatDateTime(params.appointmentDate)}</li>
            ${params.doctorName ? `<li><strong>Doctor:</strong> ${params.doctorName}</li>` : ""}
          </ul>
        `
      ),
    }),

  sendLowStockAlert: (params: {
    to: string;
    itemName: string;
    quantity: number;
    unit: string;
    status: string;
  }): Promise<void> =>
    sendEmail({
      to: params.to,
      subject: `Inventory Alert: ${params.itemName} is ${params.status}`,
      html: emailWrapper(
        "Inventory alert",
        `
          <p><strong>${params.itemName}</strong> is now <strong>${params.status}</strong>
          (${params.quantity} ${params.unit} remaining).</p>
          <p>Consider submitting a purchase request if one hasn't been made yet.</p>
        `
      ),
    }),

  sendPurchaseRequestSubmitted: (params: {
    to: string;
    itemName: string;
    quantityRequested: number;
    requestedByName: string;
    reason: string;
  }): Promise<void> =>
    sendEmail({
      to: params.to,
      subject: `Purchase Request Pending Review: ${params.itemName}`,
      html: emailWrapper(
        "New purchase request awaiting review",
        `
          <p><strong>${params.requestedByName}</strong> submitted a restock request:</p>
          <ul>
            <li><strong>Item:</strong> ${params.itemName}</li>
            <li><strong>Quantity requested:</strong> ${params.quantityRequested}</li>
            <li><strong>Reason:</strong> ${params.reason}</li>
          </ul>
          <p>Log in to review and approve or reject this request.</p>
        `
      ),
    }),
};