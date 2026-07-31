import {
  AlignmentType,
  BorderStyle,
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

export interface MedicalCertificateData {
  certificateId: string;
  studentName: string;
  studentId: string;
  consultationDate: Date;
  complaint: string;
  diagnosis: string;
  treatmentPlan?: string;
  labRequest?: string;
  medications: string[];
  physicianName: string;
}

const detailRow = (label: string, value: string): TableRow =>
  new TableRow({
    children: [
      new TableCell({
        width: { size: 28, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, bold: true })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 72, type: WidthType.PERCENTAGE },
        children: [new Paragraph(value || "Not recorded")],
      }),
    ],
  });

export async function buildMedicalCertificateDocx(
  data: MedicalCertificateData,
): Promise<Buffer> {
  const certificate = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 900, right: 900, bottom: 900, left: 900 },
        },
      },
      children: [
        new Paragraph({
          text: "SCHOOL CLINIC MANAGEMENT",
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          text: "CLINIC CONSULTATION CERTIFICATE",
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.TITLE,
          spacing: { after: 350 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Certificate reference: ", bold: true }),
            new TextRun(data.certificateId),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Date issued: ", bold: true }),
            new TextRun(new Date().toLocaleDateString("en-PH", { dateStyle: "long" })),
          ],
          spacing: { after: 300 },
        }),
        new Paragraph({
          text:
            `This certifies that ${data.studentName} (Student ID ${data.studentId}) ` +
            `was evaluated at the school clinic on ${data.consultationDate.toLocaleString("en-PH", {
              dateStyle: "long",
              timeStyle: "short",
            })}.`,
          spacing: { after: 300 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
            left: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" },
          },
          rows: [
            detailRow("Chief complaint", data.complaint),
            detailRow("Diagnosis", data.diagnosis),
            detailRow("Treatment plan", data.treatmentPlan || "Not recorded"),
            detailRow(
              "Prescribed medication",
              data.medications.length > 0 ? data.medications.join("\n") : "None prescribed",
            ),
            detailRow("Laboratory request", data.labRequest || "None"),
          ],
        }),
        new Paragraph({
          text:
            "This document confirms the recorded school-clinic consultation. " +
            "It does not by itself certify fitness for sports, employment, or return to duty.",
          spacing: { before: 350, after: 700 },
        }),
        new Paragraph({
          text: "________________________________",
          alignment: AlignmentType.RIGHT,
        }),
        new Paragraph({
          children: [new TextRun({ text: data.physicianName, bold: true })],
          alignment: AlignmentType.RIGHT,
        }),
        new Paragraph({
          text: "Attending Physician",
          alignment: AlignmentType.RIGHT,
        }),
      ],
    }],
  });

  return Packer.toBuffer(certificate);
}
