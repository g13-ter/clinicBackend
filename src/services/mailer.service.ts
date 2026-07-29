import { Resend } from "resend";
import logger from "../utils/logger";

// Log emails instead of sending when RESEND_API_KEY is unset.

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

// Email delivery must not block or fail API requests.
const sendEmail = async ({ to, subject, html }: SendEmailParams): Promise<boolean> => {
  if (process.env.NODE_ENV === "test") return true;

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromAddress =
    process.env.EMAIL_FROM || "School Clinic <onboarding@resend.dev>";
  const configuredTestRecipient = process.env.EMAIL_TEST_RECIPIENT?.trim();
  const redirectForDevelopment =
    process.env.NODE_ENV !== "production" &&
    Boolean(configuredTestRecipient) &&
    configuredTestRecipient?.toLowerCase() !== to.trim().toLowerCase();
  const deliveryRecipient = redirectForDevelopment
    ? configuredTestRecipient as string
    : to;
  const deliveryHtml = redirectForDevelopment
    ? `
      <div style="margin-bottom: 16px; border: 1px solid #f59e0b; background: #fffbeb; padding: 12px; border-radius: 6px;">
        <strong>Development email preview</strong><br />
        Intended recipient: ${to}
      </div>
      ${html}
    `
    : html;

  if (!resendApiKey) {
    logger.error("[mailer] RESEND_API_KEY not found.");
    return false;
  }

  const resend = new Resend(resendApiKey);

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: deliveryRecipient,
      subject: redirectForDevelopment ? `[TEST] ${subject}` : subject,
      html: deliveryHtml,
    });

    if (error) {
      logger.error("[mailer] Resend error:", error);
      return false;
    }

    logger.info(
      redirectForDevelopment
        ? `[mailer] Development email for ${to} redirected to ${deliveryRecipient}`
        : `[mailer] Email sent successfully to ${to}`,
    );
    return true;
  } catch (error) {
    logger.error("[mailer] Failed to send email:", error);
    return false;
  }
};

// Display clinic times consistently, regardless of the server location.
const formatDateTime = (date: Date): string =>
  new Date(date).toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: process.env.CLINIC_TIME_ZONE || "Asia/Manila",
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
  }): Promise<boolean> =>
    sendEmail({
      to: params.to,
      subject: "Appointment Scheduled - School Clinic",
      html: emailWrapper(
        "Your appointment has been scheduled",
        `
          <p>Hi ${params.patientName},</p>
          <p>Your clinic appointment has been scheduled and sent to the assigned doctor:</p>
          <ul>
            <li><strong>Date &amp; time:</strong> ${formatDateTime(params.appointmentDate)}</li>
            ${params.doctorName ? `<li><strong>Doctor:</strong> ${params.doctorName}</li>` : ""}
            <li><strong>Reason:</strong> ${params.reason}</li>
          </ul>
          <p>Please arrive a few minutes early. If you need to reschedule, contact the clinic directly.</p>
        `
      ),
    }),

  sendAppointmentDoctorConfirmed: (params: {
    to: string;
    patientName: string;
    appointmentDate: Date;
    doctorName?: string;
  }): Promise<boolean> =>
    sendEmail({
      to: params.to,
      subject: "Appointment Confirmed by Doctor - School Clinic",
      html: emailWrapper(
        "Your doctor confirmed the appointment",
        `
          <p>Hi ${params.patientName},</p>
          <p>Your appointment is confirmed and ready:</p>
          <ul>
            <li><strong>Date &amp; time:</strong> ${formatDateTime(params.appointmentDate)}</li>
            ${params.doctorName ? `<li><strong>Doctor:</strong> ${params.doctorName}</li>` : ""}
          </ul>
          <p>Please arrive a few minutes early for check-in.</p>
        `,
      ),
    }),

  sendAppointmentRescheduled: (params: {
    to: string;
    patientName: string;
    previousDate: Date;
    appointmentDate: Date;
    doctorName?: string;
    reason: string;
  }): Promise<boolean> =>
    sendEmail({
      to: params.to,
      subject: "Appointment Rescheduled - School Clinic",
      html: emailWrapper(
        "Your appointment was rescheduled",
        `
          <p>Hi ${params.patientName},</p>
          <p>Your clinic appointment schedule has changed:</p>
          <ul>
            <li><strong>Previous schedule:</strong> ${formatDateTime(params.previousDate)}</li>
            <li><strong>New schedule:</strong> ${formatDateTime(params.appointmentDate)}</li>
            ${params.doctorName ? `<li><strong>Doctor:</strong> ${params.doctorName}</li>` : ""}
            <li><strong>Reason:</strong> ${params.reason}</li>
          </ul>
          <p>Future reminders will use the new schedule.</p>
        `,
      ),
    }),

  sendAppointmentCancelled: (params: {
    to: string;
    patientName: string;
    appointmentDate: Date;
    doctorName?: string;
    reason: string;
    cancellationReason: string;
  }): Promise<boolean> =>
    sendEmail({
      to: params.to,
      subject: "Appointment Cancelled - School Clinic",
      html: emailWrapper(
        "Your appointment was cancelled",
        `
          <p>Hi ${params.patientName},</p>
          <p>Your clinic appointment has been cancelled:</p>
          <ul>
            <li><strong>Cancelled schedule:</strong> ${formatDateTime(params.appointmentDate)}</li>
            ${params.doctorName ? `<li><strong>Doctor:</strong> ${params.doctorName}</li>` : ""}
            <li><strong>Reason for visit:</strong> ${params.reason}</li>
            <li><strong>Cancellation reason:</strong> ${params.cancellationReason}</li>
          </ul>
          <p>No further reminders will be sent for this appointment. Contact the clinic if you need a new schedule.</p>
        `,
      ),
    }),

  sendAppointmentReminder: (params: {
    to: string;
    patientName: string;
    appointmentDate: Date;
    doctorName?: string;
  }): Promise<boolean> =>
    sendEmail({
      to: params.to,
      subject: "Reminder: Upcoming School Clinic Appointment",
      html: emailWrapper(
        "Your appointment is coming up",
        `
          <p>Hi ${params.patientName},</p>
          <p>This is your scheduled reminder for an upcoming clinic appointment:</p>
          <ul>
            <li><strong>Date &amp; time:</strong> ${formatDateTime(params.appointmentDate)}</li>
            ${params.doctorName ? `<li><strong>Doctor:</strong> ${params.doctorName}</li>` : ""}
          </ul>
          <p>Please arrive a few minutes early.</p>
        `
      ),
    }),

  sendLowStockAlert: (params: {
    to: string;
    itemName: string;
    quantity: number;
    unit: string;
    status: string;
  }): Promise<boolean> =>
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
  }): Promise<boolean> =>
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
