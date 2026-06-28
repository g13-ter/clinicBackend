import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { ReportNarrative } from "./reportNarrative";

// Builds an actual .docx file (as a Buffer) from the report narrative.
// Uses the `docx` npm package - this runs entirely on the server, with
// no external service call, so it's instant and free.

export const buildReportDocx = async (narrative: ReportNarrative): Promise<Buffer> => {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: narrative.title,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),

          new Paragraph({
            children: [
              new TextRun({
                text: narrative.periodLabel,
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          new Paragraph({
            text: narrative.introduction,
            spacing: { after: 300 },
          }),

          new Paragraph({
            text: "Patient Registrations",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: narrative.patientSection, spacing: { after: 200 } }),

          new Paragraph({
            text: "Clinic Visits",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: narrative.visitSection, spacing: { after: 200 } }),

          new Paragraph({
            text: "Medical History",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: narrative.medicalHistorySection, spacing: { after: 200 } }),

          new Paragraph({
            text: "Appointments",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: narrative.appointmentSection, spacing: { after: 200 } }),

          new Paragraph({
            text: "Medicine Inventory",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: narrative.inventorySection, spacing: { after: 400 } }),

          new Paragraph({
            children: [
              new TextRun({
                text: narrative.closing,
                italics: true,
                size: 20,
              }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
};