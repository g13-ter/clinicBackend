import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export interface ReferralDocumentData {
  studentName: string;
  studentId: string;
  visitDate: Date;
  complaint: string;
  vitals: string;
  emergencyDetails?: string;
  referralFacility: string;
  referralReason: string;
  referralOutcome?: string;
  guardianNotifiedAt?: Date;
  providerName?: string;
}

const cell = (label: string, value: string): TableRow =>
  new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
      new TableCell({ children: [new Paragraph(value)] }),
    ],
  });

export async function buildReferralDocx(data: ReferralDocumentData): Promise<Buffer> {
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "School Clinic Referral Form", heading: HeadingLevel.TITLE }),
        new Paragraph({ text: `Generated ${new Date().toLocaleString("en-PH")}` }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            cell("Student", `${data.studentName} (${data.studentId})`),
            cell("Visit date", data.visitDate.toLocaleString("en-PH")),
            cell("Chief complaint", data.complaint),
            cell("Vitals", data.vitals || "Not recorded"),
            cell("Emergency details", data.emergencyDetails || "None recorded"),
            cell("Receiving facility", data.referralFacility),
            cell("Referral reason", data.referralReason),
            cell("Outcome / follow-up", data.referralOutcome || "Pending"),
            cell("Guardian notification", data.guardianNotifiedAt ? data.guardianNotifiedAt.toLocaleString("en-PH") : "Not recorded"),
            cell("Referring provider", data.providerName || "Not recorded"),
          ],
        }),
        new Paragraph({ text: "Receiving Facility Notes", heading: HeadingLevel.HEADING_2 }),
        new Paragraph("____________________________________________________________________"),
        new Paragraph("____________________________________________________________________"),
        new Paragraph("____________________________________________________________________"),
        new Paragraph({ text: "Signature: __________________________  Date: __________________", spacing: { before: 400 } }),
      ],
    }],
  });
  return Packer.toBuffer(document);
}
