import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

export interface MedicalCertificateData {
  certificateId: string;
  clinicName: string;
  clinicLocation: string;
  clinicPhoneNumber: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientType: "student" | "employee";
  patientIdentifierLabel: "Student ID" | "Employee ID" | "Patient ID";
  patientIdentifier: string;
  consultationDate: Date;
  complaint: string;
  diagnosis: string;
  remarks?: string;
  physicianName: string;
  physicianLicenseNumber?: string;
  physicianPtrNumber?: string;
  studentDisposition?: "returned_to_class" | "sent_home" | "guardian_pickup";
  fitnessForWork?: "fit_to_work" | "not_fit_to_work";
}

const physicianNameWithCredentials = (name: string): string =>
  /(?:,\s*|\s+)M\.?D\.?$/i.test(name.trim()) ? name.trim() : `${name.trim()}, MD`;

const detailParagraph = (label: string, value: string, boldValue = false): Paragraph =>
  new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value || "Not recorded", bold: boldValue }),
    ],
    spacing: { after: 220 },
  });

export async function buildMedicalCertificateDocx(
  data: MedicalCertificateData,
): Promise<Buffer> {
  const studentDispositionLabels = {
    returned_to_class: "May return to class",
    sent_home: "Advised to go home",
    guardian_pickup: "Guardian pickup needed",
  };
  const disposition = data.patientType === "student"
    ? data.studentDisposition ? studentDispositionLabels[data.studentDisposition] : "Not recorded"
    : data.fitnessForWork === "fit_to_work" ? "Fit to work" : "Not fit to work";
  const remarks = [disposition, data.remarks?.trim()].filter(Boolean).join(". ");
  const demographicDetails = [
    data.patientAge != null ? `${data.patientAge} years old` : "",
    data.patientGender ?? "",
  ].filter(Boolean).join(", ");

  const certificate = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 900, right: 1000, bottom: 900, left: 1000 },
        },
      },
      children: [
        new Paragraph({
          text: data.clinicName.toUpperCase(),
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 80 },
        }),
        new Paragraph({
          text: data.clinicLocation,
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Clinic contact: ", bold: true }),
            new TextRun(data.clinicPhoneNumber),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
        }),
        new Paragraph({
          text: "MEDICAL CERTIFICATE",
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.TITLE,
          spacing: { before: 180, after: 350 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Certificate reference: ", bold: true }),
            new TextRun(data.certificateId),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Date issued: ", bold: true }),
            new TextRun(new Date().toLocaleDateString("en-PH", { dateStyle: "long" })),
          ],
          spacing: { after: 300 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "TO WHOM IT MAY CONCERN:", bold: true })],
          spacing: { after: 220 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "This is to certify that " }),
            new TextRun({ text: data.patientName, bold: true }),
            new TextRun({ text: ` (${data.patientIdentifierLabel} ${data.patientIdentifier}) was seen and examined at the school clinic on ${data.consultationDate.toLocaleString("en-PH", {
              dateStyle: "long",
              timeStyle: "short",
            })}.` }),
          ],
          spacing: { after: 100 },
        }),
        ...(demographicDetails
          ? [new Paragraph({ text: demographicDetails, spacing: { after: 220 } })]
          : []),
        detailParagraph("Chief complaint", data.complaint, true),
        detailParagraph("Working diagnosis", data.diagnosis),
        detailParagraph("Remarks", remarks, true),
        new Paragraph({
          text: "This certificate is issued upon request for school-related purposes.",
          spacing: { before: 120, after: 650 },
        }),
        new Paragraph({
          text: "________________________________________",
          alignment: AlignmentType.RIGHT,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: physicianNameWithCredentials(data.physicianName), bold: true })],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 60 },
        }),
        new Paragraph({
          text: "Attending Physician",
          alignment: AlignmentType.RIGHT,
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "License No.: ", bold: true }),
            new TextRun(data.physicianLicenseNumber || "____________________"),
          ],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "PTR No.: ", bold: true }),
            new TextRun(data.physicianPtrNumber || "____________________"),
          ],
          alignment: AlignmentType.RIGHT,
        }),
      ],
    }],
  });

  return Packer.toBuffer(certificate);
}
