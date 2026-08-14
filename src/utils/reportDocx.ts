import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { ReportStats } from "../services/report.service";

// Build period-aware clinic reports and mark untracked sections for manual completion.

export type VisitReportPeriod = "daily" | "weekly" | "monthly" | "yearly" | "custom";

const NOT_TRACKED_NOTE = "Not tracked by system - please complete manually.";

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
};

const headerCell = (text: string): TableCell =>
  new TableCell({
    borders: cellBorders,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
  });

const bodyCell = (text: string, alignRight = false): TableCell =>
  new TableCell({
    borders: cellBorders,
    children: [
      new Paragraph({
        alignment: alignRight ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text })],
      }),
    ],
  });

const sectionHeading = (text: string): Paragraph =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });

const blankLine = (label: string): Paragraph =>
  new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: "____________________________" }),
    ],
    spacing: { after: 100 },
  });

const configuredLine = (label: string, value?: string): Paragraph =>
  value ? new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value })], spacing: { after: 100 } }) : blankLine(label);

const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export const formatReportPeriodLabel = (start: Date, end: Date, period: VisitReportPeriod): string => {
  if (period === "daily") return formatDate(start);
  if (period === "monthly") {
    return start.toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" });
  }
  if (period === "yearly") return String(start.getUTCFullYear());
  return `${formatDate(start)} to ${formatDate(end)}`;
};

export const getReportTitle = (start: Date, end: Date, period: VisitReportPeriod): string => {
  if (period !== "custom") return `${period.toUpperCase()} MEDICAL CASE REPORT`;
  const sameDay =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate();
  const durationDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);

  if (sameDay) return "DAILY MEDICAL CASE REPORT";
  if (durationDays <= 7) return "WEEKLY MEDICAL CASE REPORT";
  if (
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth()
  ) {
    return "MONTHLY MEDICAL CASE REPORT";
  }
  return "ANNUAL MEDICAL CASE REPORT";
};

export const buildReportDocx = async (stats: ReportStats, period: VisitReportPeriod = "custom"): Promise<Buffer> => {
  const periodLabel = formatReportPeriodLabel(stats.periodStart, stats.periodEnd, period);
  const patientScope = stats.patientTypeFilter
    ? stats.patientTypeFilter === "employees"
      ? "teachers and staff"
      : `${stats.patientTypeFilter === "staff" ? "staff" : `${stats.patientTypeFilter}s`}`
    : "students, teachers, and staff";

  // I. Executive Summary
  const totalVisits = stats.studentAttendance.total;
  const executiveSummary =
    (totalVisits > 0
      ? `This report presents the activities and services provided by the school clinic for ${periodLabel}. ` +
        `A total of ${totalVisits} ${patientScope} ${totalVisits === 1 ? "visit" : "visits"} ${totalVisits === 1 ? "was" : "were"} recorded during this period. `
      : `This report presents the activities and services provided by the school clinic for ${periodLabel}. ` +
        `No clinic visits were recorded during this period. `) +
    `${stats.uniqueStudentsServed} unique ${stats.uniqueStudentsServed === 1 ? "patient was" : "patients were"} served through ${totalVisits} clinic visits. ` +
    `${stats.appointmentStats.total} ${stats.appointmentStats.total === 1 ? "appointment was" : "appointments were"} booked in this period ` +
    `(${stats.appointmentStats.completed} completed, ${stats.appointmentStats.cancelled} cancelled), and ` +
    `Clinical documentation included ${stats.nursingAssessmentsCount} nursing ${stats.nursingAssessmentsCount === 1 ? "assessment" : "assessments"} and ` +
    `${stats.physicianMedicalRecordsCount} physician medical ${stats.physicianMedicalRecordsCount === 1 ? "record" : "records"}. ` +
    `${stats.lowStockMedicines.length > 0
      ? `${stats.lowStockMedicines.length} medicine ${stats.lowStockMedicines.length === 1 ? "item is" : "items are"} currently running low and may require restocking.`
      : `Medicine inventory levels are currently adequate.`} ` +
    `${stats.pendingPurchaseRequestsCount > 0
      ? `${stats.pendingPurchaseRequestsCount} purchase ${stats.pendingPurchaseRequestsCount === 1 ? "request is" : "requests are"} currently pending admin review.`
      : `There are no pending purchase requests at this time.`}`;

  // II. Clinic Attendance
  const attendanceTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [headerCell("Category"), headerCell("Male"), headerCell("Female"), headerCell("Total")],
      }),
      ...(["student", "teacher", "staff"] as const).map((type) => {
        const attendance = stats.attendanceByPatientType[type];
        const label = type === "student" ? "Students" : type === "teacher" ? "Teachers" : "Staff";
        return new TableRow({ children: [
          bodyCell(label),
          bodyCell(String(attendance.male), true),
          bodyCell(String(attendance.female), true),
          bodyCell(String(attendance.total), true),
        ] });
      }),
      new TableRow({
        children: [
          headerCell("Total Clinic Visits"),
          headerCell(String(stats.studentAttendance.male)),
          headerCell(String(stats.studentAttendance.female)),
          headerCell(String(stats.studentAttendance.total)),
        ],
      }),
    ],
  });

  // III. Common Reasons for Visits
  const complaintTypes = stats.patientTypeFilter === "employees"
    ? (["teacher", "staff"] as const)
    : stats.patientTypeFilter
    ? [stats.patientTypeFilter]
    : (["student", "teacher", "staff"] as const);
  const complaintRows = stats.complaintCounts.length > 0
    ? complaintTypes.flatMap((type) => stats.complaintCountsByPatientType[type].map(
        (c) => new TableRow({ children: [
          bodyCell(type === "student" ? "Student" : type === "teacher" ? "Teacher" : "Staff"),
          bodyCell(c.complaint),
          bodyCell(String(c.count), true),
        ] }),
      ))
    : [
        new TableRow({
          children: [bodyCell("-"), bodyCell("No visits recorded during this period."), bodyCell("-", true)],
        }),
      ];

  const complaintsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [headerCell("Patient Type"), headerCell("Illness/Injury"), headerCell("Number of Cases")] }),
      ...complaintRows,
    ],
  });

  // IV. Medicine Inventory
  const medicineRows = stats.medicineStock.length > 0
    ? stats.medicineStock.map(
        (m) =>
          new TableRow({
            children: [
              bodyCell(m.name),
              bodyCell(`${m.remainingStock} ${m.unit}${m.isLowStock ? " (LOW)" : ""}`, true),
            ],
          })
      )
    : [
        new TableRow({
          children: [bodyCell("No medicines in inventory."), bodyCell("-", true)],
        }),
      ];

  const medicineTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [headerCell("Medicine/Supply"), headerCell("Current Stock")],
      }),
      ...medicineRows,
    ],
  });

  // VIII. Issues and Concerns
  const lowStockLine =
    stats.lowStockMedicines.length > 0
      ? stats.lowStockMedicines.map((m) => `${m.name} (${m.remainingStock} ${m.unit} remaining)`).join(", ")
      : "None at this time.";

  // Additional system data outside the official numbered sections.
  const appointmentsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [headerCell("Status"), headerCell("Count")],
      }),
      new TableRow({ children: [bodyCell("Pending"), bodyCell(String(stats.appointmentStats.pending), true)] }),
      new TableRow({ children: [bodyCell("Confirmed"), bodyCell(String(stats.appointmentStats.confirmed), true)] }),
      new TableRow({ children: [bodyCell("Completed"), bodyCell(String(stats.appointmentStats.completed), true)] }),
      new TableRow({ children: [bodyCell("Cancelled"), bodyCell(String(stats.appointmentStats.cancelled), true)] }),
      new TableRow({
        children: [headerCell("Total Appointments"), headerCell(String(stats.appointmentStats.total))],
      }),
    ],
  });

  const referralsTable = stats.referrals.length > 0
    ? new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [headerCell("Receiving Facility"), headerCell("Reason"), headerCell("Outcome / Follow-up")] }),
          ...stats.referrals.map((referral) => new TableRow({ children: [bodyCell(referral.facility), bodyCell(referral.reason), bodyCell(referral.outcome || "Pending follow-up")] })),
        ],
      })
    : null;

  // IX. Data-driven Recommendations
  const recommendations: string[] = [];

  if (stats.lowStockMedicines.length > 0) {
    recommendations.push(
      `Replenish clinic medicines and supplies currently low on stock: ${lowStockLine}.`
    );
  } else {
    recommendations.push("Continue monitoring medicine inventory levels, which are currently adequate.");
  }

  if (stats.pendingPurchaseRequestsCount > 0) {
    recommendations.push(
      `Review and act on the ${stats.pendingPurchaseRequestsCount} pending purchase ` +
        `${stats.pendingPurchaseRequestsCount === 1 ? "request" : "requests"} awaiting approval.`
    );
  }

  const topComplaint = stats.complaintCounts[0];
  if (topComplaint && stats.studentAttendance.total > 0 && topComplaint.count / stats.studentAttendance.total >= 0.25) {
    recommendations.push(
      `Consider a targeted health education session on "${topComplaint.complaint}", the most frequently ` +
        `reported concern this period (${topComplaint.count} of ${stats.studentAttendance.total} visits).`
    );
  } else {
    recommendations.push("Continue health education and awareness activities.");
  }

  if (
    stats.appointmentStats.total > 0 &&
    stats.appointmentStats.cancelled / stats.appointmentStats.total >= 0.2
  ) {
    recommendations.push(
      `Follow up on the relatively high number of cancelled appointments this period ` +
        `(${stats.appointmentStats.cancelled} of ${stats.appointmentStats.total}) to identify possible scheduling issues.`
    );
  }

  recommendations.push("Encourage students to report illnesses early.");
  recommendations.push("Strengthen coordination with parents and local health authorities.");

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: getReportTitle(stats.periodStart, stats.periodEnd, period),
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),

          configuredLine("School", process.env.SCHOOL_NAME),
          configuredLine("School Clinic", process.env.CLINIC_NAME),
          new Paragraph({
            children: [
              new TextRun({ text: "Reporting Period: ", bold: true }),
              new TextRun({ text: periodLabel }),
            ],
            spacing: { after: 100 },
          }),
          configuredLine("Prepared by", process.env.REPORT_PREPARED_BY),
          new Paragraph({
            children: [
              new TextRun({ text: "Position: ", bold: true }),
              new TextRun({ text: process.env.REPORT_PREPARER_POSITION || "School Nurse/Clinic Staff" }),
            ],
            spacing: { after: 100 },
          }),
          blankLine("Date Submitted"),

          sectionHeading("I. Executive Summary"),
          new Paragraph({ text: executiveSummary, spacing: { after: 200 } }),

          sectionHeading("II. Clinic Attendance"),
          attendanceTable,

          sectionHeading("III. Common Reasons for Clinic Visits"),
          complaintsTable,

          sectionHeading("IV. Appointments and Consultations"),
          new Paragraph({
            text: `${stats.nursingAssessmentsCount} nursing assessments and ${stats.physicianMedicalRecordsCount} physician medical records were logged in this period. Appointment statuses reflect their status when this report was generated.`,
            spacing: { after: 150 },
          }),
          appointmentsTable,

          sectionHeading("V. Referrals"),
          ...(referralsTable ? [referralsTable] : [new Paragraph({ text: "No referrals recorded in this period.", spacing: { after: 200 } })]),

          sectionHeading("VI. Accidents and Emergencies"),
          new Paragraph({ text: `${stats.emergencyCount} emergency ${stats.emergencyCount === 1 ? "case was" : "cases were"} recorded in this period.`, spacing: { after: 200 } }),

          sectionHeading("VII. Medicine Inventory Snapshot"),
          new Paragraph({
            children: [
              new TextRun({
                text: "Current inventory snapshot at report generation time. Use the medication and inventory usage reports for detailed period movements.",
                italics: true,
                size: 18,
              }),
            ],
            spacing: { after: 150 },
          }),
          medicineTable,

          sectionHeading("VIII. Health Programs and Activities"),
          new Paragraph({ text: NOT_TRACKED_NOTE, spacing: { after: 200 } }),

          sectionHeading("IX. Issues and Concerns"),
          ...(stats.hasTestData ? [new Paragraph({ text: "Data quality warning: test or demo records were detected. Remove or archive them before formal submission.", spacing: { after: 100 } })] : []),
          new Paragraph({
            children: [
              new TextRun({ text: "Shortage of medicines: ", bold: true }),
              new TextRun({ text: lowStockLine }),
            ],
            spacing: { after: 100 },
          }),
          blankLine("Equipment needing repair/replacement"),
          blankLine("Other concerns"),

          sectionHeading("X. Recommendations"),
          ...recommendations.map(
            (text, i) => new Paragraph({ text: `${i + 1}. ${text}`, spacing: { after: 50 } })
          ),

          sectionHeading("XI. Prepared By"),
          new Paragraph({ children: [new TextRun({ text: "Prepared by:", bold: true })], spacing: { after: 150 } }),
          configuredLine("Name", process.env.REPORT_PREPARED_BY),
          configuredLine("Position", process.env.REPORT_PREPARER_POSITION),
          blankLine("Signature"),
          new Paragraph({ children: [new TextRun({ text: "Noted by:", bold: true })], spacing: { before: 200, after: 150 } }),
          configuredLine("School Principal", process.env.SCHOOL_PRINCIPAL),
          blankLine("Signature"),

          new Paragraph({
            children: [
              new TextRun({
                text: `This report was generated automatically from clinic system records as of ${formatDate(new Date())}. Sections marked "${NOT_TRACKED_NOTE}" require manual completion.`,
                italics: true,
                size: 18,
              }),
            ],
            spacing: { before: 300 },
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
};
