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

// Builds an actual .docx file (as a Buffer) matching the official
// School Clinic Monthly Report template. Runs entirely on the server -
// no external service call, so generation is near-instant.
//
// Sections this system CAN fill in with real data: Executive Summary,
// Clinic Attendance (students only, by gender), Common Reasons for
// Visits, Medicine Stock, and a low-stock note under Issues & Concerns.
//
// Sections this system genuinely does NOT track - Health Programs,
// Referrals, and Accidents/Emergencies as a distinct category - are
// clearly labeled as "Not tracked by system - please complete manually"
// rather than presented as empty tables, so whoever reads the report
// doesn't mistake "no data" for "zero occurred."

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

const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const formatPeriodLabel = (start: Date, end: Date): string => {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return start.toLocaleDateString("en-US", { year: "numeric", month: "long" });
  }
  return `${formatDate(start)} to ${formatDate(end)}`;
};

export const buildReportDocx = async (stats: ReportStats): Promise<Buffer> => {
  const periodLabel = formatPeriodLabel(stats.periodStart, stats.periodEnd);

  // ----- I. Executive Summary -----
  const totalVisits = stats.studentAttendance.total;
  const executiveSummary =
    (totalVisits > 0
      ? `This report presents the activities and services provided by the school clinic for ${periodLabel}. ` +
        `A total of ${totalVisits} student ${totalVisits === 1 ? "visit" : "visits"} ${totalVisits === 1 ? "was" : "were"} recorded during this period. `
      : `This report presents the activities and services provided by the school clinic for ${periodLabel}. ` +
        `No clinic visits were recorded during this period. `) +
    `${stats.appointmentStats.total} ${stats.appointmentStats.total === 1 ? "appointment was" : "appointments were"} booked in this period ` +
    `(${stats.appointmentStats.completed} completed, ${stats.appointmentStats.cancelled} cancelled), and ` +
    `${stats.consultationsCount} doctor ${stats.consultationsCount === 1 ? "consultation was" : "consultations were"} logged. ` +
    `${stats.lowStockMedicines.length > 0
      ? `${stats.lowStockMedicines.length} medicine ${stats.lowStockMedicines.length === 1 ? "item is" : "items are"} currently running low and may require restocking.`
      : `Medicine inventory levels are currently adequate.`} ` +
    `${stats.pendingPurchaseRequestsCount > 0
      ? `${stats.pendingPurchaseRequestsCount} purchase ${stats.pendingPurchaseRequestsCount === 1 ? "request is" : "requests are"} currently pending admin review.`
      : `There are no pending purchase requests at this time.`}`;

  // ----- II. Clinic Attendance table -----
  const attendanceTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [headerCell("Category"), headerCell("Male"), headerCell("Female"), headerCell("Total")],
      }),
      new TableRow({
        children: [
          bodyCell("Students"),
          bodyCell(String(stats.studentAttendance.male), true),
          bodyCell(String(stats.studentAttendance.female), true),
          bodyCell(String(stats.studentAttendance.total), true),
        ],
      }),
      new TableRow({
        children: [
          bodyCell("Teaching Staff"),
          bodyCell("N/A - not tracked", true),
          bodyCell("N/A", true),
          bodyCell("N/A", true),
        ],
      }),
      new TableRow({
        children: [
          bodyCell("Non-Teaching Staff"),
          bodyCell("N/A - not tracked", true),
          bodyCell("N/A", true),
          bodyCell("N/A", true),
        ],
      }),
      new TableRow({
        children: [
          headerCell("Total Patients"),
          headerCell(String(stats.studentAttendance.male)),
          headerCell(String(stats.studentAttendance.female)),
          headerCell(String(stats.studentAttendance.total)),
        ],
      }),
    ],
  });

  // ----- III. Common Reasons for Visits table -----
  const complaintRows = stats.complaintCounts.length > 0
    ? stats.complaintCounts.map(
        (c) =>
          new TableRow({
            children: [bodyCell(c.complaint), bodyCell(String(c.count), true)],
          })
      )
    : [
        new TableRow({
          children: [bodyCell("No visits recorded during this period."), bodyCell("-", true)],
        }),
      ];

  const complaintsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [headerCell("Illness/Injury"), headerCell("Number of Cases")] }),
      ...complaintRows,
    ],
  });

  // ----- IV. Medicines and Supplies table -----
  const medicineRows = stats.medicineStock.length > 0
    ? stats.medicineStock.map(
        (m) =>
          new TableRow({
            children: [
              bodyCell(m.name),
              bodyCell("Not tracked", true),
              bodyCell(`${m.remainingStock} ${m.unit}${m.isLowStock ? " (LOW)" : ""}`, true),
            ],
          })
      )
    : [
        new TableRow({
          children: [bodyCell("No medicines in inventory."), bodyCell("-", true), bodyCell("-", true)],
        }),
      ];

  const medicineTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [headerCell("Medicine/Supply"), headerCell("Quantity Used"), headerCell("Remaining Stock")],
      }),
      ...medicineRows,
    ],
  });

  // ----- VIII. Issues and Concerns -----
  const lowStockLine =
    stats.lowStockMedicines.length > 0
      ? stats.lowStockMedicines.map((m) => `${m.name} (${m.remainingStock} ${m.unit} remaining)`).join(", ")
      : "None at this time.";

  // ----- Appointments & Consultations (additional system data) -----
  // Not part of the official monthly report template's numbered sections,
  // but genuine system-recorded data worth surfacing - kept separate from
  // the numbered sections above so it doesn't disturb the official
  // template's numbering.
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

  // ----- IX. Recommendations - genuinely data-driven, not a fixed list -----
  // Each recommendation only appears if the underlying data actually
  // supports it, and cites the real figures - so this section changes
  // meaningfully between reports instead of reading the same every time.
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
            text: "SCHOOL CLINIC MONTHLY REPORT",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),

          blankLine("School"),
          blankLine("School Clinic"),
          new Paragraph({
            children: [
              new TextRun({ text: "Month & Year: ", bold: true }),
              new TextRun({ text: periodLabel }),
            ],
            spacing: { after: 100 },
          }),
          blankLine("Prepared by"),
          new Paragraph({
            children: [
              new TextRun({ text: "Position: ", bold: true }),
              new TextRun({ text: "School Nurse/Clinic Staff" }),
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

          sectionHeading("IV. Medicines and Supplies Dispensed"),
          new Paragraph({
            children: [
              new TextRun({
                text: "Note: this system tracks current stock levels, not a historical dispensing log, so \"Quantity Used\" is not available and is marked accordingly below.",
                italics: true,
                size: 18,
              }),
            ],
            spacing: { after: 150 },
          }),
          medicineTable,

          sectionHeading("Appointments & Consultations Summary (System Data)"),
          new Paragraph({
            text: `${stats.consultationsCount} doctor ${stats.consultationsCount === 1 ? "consultation was" : "consultations were"} recorded in this period.`,
            spacing: { after: 150 },
          }),
          appointmentsTable,

          sectionHeading("V. Health Programs and Activities"),
          new Paragraph({ text: NOT_TRACKED_NOTE, spacing: { after: 200 } }),

          sectionHeading("VI. Referrals"),
          new Paragraph({ text: NOT_TRACKED_NOTE, spacing: { after: 200 } }),

          sectionHeading("VII. Accidents and Emergencies"),
          new Paragraph({ text: NOT_TRACKED_NOTE, spacing: { after: 200 } }),

          sectionHeading("VIII. Issues and Concerns"),
          new Paragraph({
            children: [
              new TextRun({ text: "Shortage of medicines: ", bold: true }),
              new TextRun({ text: lowStockLine }),
            ],
            spacing: { after: 100 },
          }),
          blankLine("Equipment needing repair/replacement"),
          blankLine("Other concerns"),

          sectionHeading("IX. Recommendations"),
          ...recommendations.map(
            (text, i) => new Paragraph({ text: `${i + 1}. ${text}`, spacing: { after: 50 } })
          ),

          sectionHeading("X. Prepared By"),
          new Paragraph({ children: [new TextRun({ text: "Prepared by:", bold: true })], spacing: { after: 150 } }),
          blankLine("Name"),
          blankLine("Position"),
          blankLine("Signature"),
          new Paragraph({ children: [new TextRun({ text: "Noted by:", bold: true })], spacing: { before: 200, after: 150 } }),
          blankLine("School Principal"),
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