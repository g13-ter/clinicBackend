import { ReportStats } from "../services/report.service";

// Turns raw statistics into report-quality written prose.
// This is NOT a call to an external AI - it's a deterministic template
// with conditional logic, so output is instant, free, and 100% accurate
// to the underlying data every single time. For a board report, accuracy
// and consistency matter far more than creative phrasing.

const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const formatPeriodLabel = (start: Date, end: Date): string => {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return start.toLocaleDateString("en-US", { year: "numeric", month: "long" });
  }
  return `${formatDate(start)} to ${formatDate(end)}`;
};

export interface ReportNarrative {
  title: string;
  periodLabel: string;
  introduction: string;
  patientSection: string;
  visitSection: string;
  medicalHistorySection: string;
  appointmentSection: string;
  inventorySection: string;
  closing: string;
}

export const buildReportNarrative = (stats: ReportStats): ReportNarrative => {
  const periodLabel = formatPeriodLabel(stats.periodStart, stats.periodEnd);

  const title = "School Clinic Report";

  const introduction =
    `This report summarizes school clinic activity for the period of ${periodLabel}, ` +
    `covering patient registrations, clinic visits, medical records, appointments, ` +
    `and medicine inventory status.`;

  // ----- Patients -----
  const patientSection =
    stats.newPatients > 0
      ? `During this period, ${stats.newPatients} new ${stats.newPatients === 1 ? "patient" : "patients"} ` +
        `${stats.newPatients === 1 ? "was" : "were"} registered in the clinic system.`
      : `No new patients were registered in the clinic system during this period.`;

  // ----- Visits -----
  let visitSection: string;
  if (stats.totalVisits === 0) {
    visitSection = `No clinic visits were recorded during this period.`;
  } else {
    const visitCountSentence =
      `The clinic recorded a total of ${stats.totalVisits} ${stats.totalVisits === 1 ? "visit" : "visits"} ` +
      `during this period.`;

    let complaintsSentence = "";
    if (stats.topComplaints.length > 0) {
      const topList = stats.topComplaints
        .map((c) => `${c.complaint} (${c.count} ${c.count === 1 ? "case" : "cases"})`)
        .join(", ");
      complaintsSentence = ` The most commonly reported complaints were: ${topList}.`;
    }

    visitSection = visitCountSentence + complaintsSentence;
  }

  // ----- Medical History -----
  const medicalHistorySection =
    stats.newMedicalHistoryEntries > 0
      ? `${stats.newMedicalHistoryEntries} new medical history ${stats.newMedicalHistoryEntries === 1 ? "entry" : "entries"} ` +
        `${stats.newMedicalHistoryEntries === 1 ? "was" : "were"} added by clinic staff during this period.`
      : `No new medical history entries were added during this period.`;

  // ----- Appointments -----
  let appointmentSection: string;
  if (stats.appointments.total === 0) {
    appointmentSection = `No appointments were booked during this period.`;
  } else {
    const statusParts = Object.entries(stats.appointments.byStatus)
      .map(([status, count]) => `${count} ${status}`)
      .join(", ");

    appointmentSection =
      `A total of ${stats.appointments.total} ${stats.appointments.total === 1 ? "appointment" : "appointments"} ` +
      `${stats.appointments.total === 1 ? "was" : "were"} booked during this period (${statusParts}).`;
  }

  // ----- Inventory -----
  let inventorySection: string;
  if (stats.lowStockMedicines.length === 0) {
    inventorySection = `Medicine inventory levels are currently adequate, with no items below their low-stock threshold.`;
  } else {
    const lowStockList = stats.lowStockMedicines
      .map((m) => `${m.name} (${m.quantity} ${m.unit} remaining)`)
      .join(", ");
    inventorySection =
      `As of this report, the following ${stats.lowStockMedicines.length === 1 ? "item is" : "items are"} ` +
      `running low and may require restocking: ${lowStockList}.`;
  }
  if (stats.newMedicinesAdded > 0) {
    inventorySection += ` ${stats.newMedicinesAdded} new ${stats.newMedicinesAdded === 1 ? "medicine" : "medicines"} ` +
      `${stats.newMedicinesAdded === 1 ? "was" : "were"} added to inventory during this period.`;
  }

  // ----- Closing -----
  const closing =
    `This report was generated automatically from clinic system records and reflects data ` +
    `recorded as of ${formatDate(new Date())}.`;

  return {
    title,
    periodLabel,
    introduction,
    patientSection,
    visitSection,
    medicalHistorySection,
    appointmentSection,
    inventorySection,
    closing,
  };
};