import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import ClinicVisit from "../src/models/clinicVisit.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";
import { formatReportPeriodLabel, getReportTitle } from "../src/utils/reportDocx";

dotenv.config();

// Buffer DOCX responses that Supertest does not parse automatically.
const binaryParser = (res: any, callback: (err: Error | null, body: Buffer) => void) => {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (chunk: string) => {
    data += chunk;
  });
  res.on("end", () => {
    callback(null, Buffer.from(data, "binary"));
  });
};

let adminToken: string;
let adminId: string;
let nurseToken: string;
let nurseId: string;
let doctorToken: string;
let doctorId: string;

let testPatientId: string;
let testVisitId: string;

// DOCX files use the ZIP "PK" signature.
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b]);

const isValidDocxBuffer = (buffer: Buffer): boolean =>
  buffer.length > 100 && buffer.subarray(0, 2).equals(ZIP_SIGNATURE);


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const admin = await createTestUserAndLogin("admin", "report_admin");
  adminToken = admin.token;
  adminId = admin.userId;

  const nurse = await createTestUserAndLogin("nurse", "report_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

  const doctor = await createTestUserAndLogin("doctor", "report_doctor");
  doctorToken = doctor.token;
  doctorId = doctor.userId;

  // Seed reportable clinic data.
  const patient = await Patient.create({
    studentId: `TEST-REPORT-${Date.now()}`,
    firstName: "Report",
    lastName: "TestPatient",
    age: 18,
    gender: "Male",
    course: "BSIT",
    yearLevel: 1,
    contactNumber: "09171234567",
    address: "Test Address"
  });
  testPatientId = (patient._id as any).toString();

  const visit = await ClinicVisit.create({
    patientId: testPatientId,
    complaint: "TEST_REPORT_UNIQUE_COMPLAINT",
    treatment: "Rest",
    recordedBy: nurseId,
  });
  testVisitId = (visit._id as any).toString();

});


afterAll(async () => {

  await deleteTestUser(adminId);
  await deleteTestUser(nurseId);
  await deleteTestUser(doctorId);

  await ClinicVisit.findByIdAndDelete(testVisitId);
  await Patient.findByIdAndDelete(testPatientId);

  await mongoose.connection.close();

});


describe("Clinic Summary Report - access control", () => {

  it("allows a NURSE to generate the report", async () => {

    const res = await request(app)
      .get("/api/reports/clinic-summary")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(200);

  });


  it("blocks an unauthenticated request", async () => {

    const res = await request(app).get("/api/reports/clinic-summary");

    expect(res.status).toBe(401);

  });

  it("allows doctors and blocks admins", async () => {
    const doctorResponse = await request(app)
      .get("/api/reports/clinic-summary")
      .set("Authorization", `Bearer ${doctorToken}`);
    const adminResponse = await request(app)
      .get("/api/reports/clinic-summary")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(doctorResponse.status).toBe(200);
    expect(adminResponse.status).toBe(403);
  });

});


describe("Clinic Summary Report - default range (no dates given)", () => {

  it("generates a valid docx file for the current month by default", async () => {

    const res = await request(app)
      .get("/api/reports/clinic-summary")
      .set("Authorization", `Bearer ${nurseToken}`)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename=/);

    expect(isValidDocxBuffer(res.body)).toBe(true);

  });

});


describe("Clinic Summary Report - custom date range", () => {

  it("rejects a request with only startDate (no endDate)", async () => {

    const res = await request(app)
      .get("/api/reports/clinic-summary?startDate=2026-06-01")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);

  });


  it("rejects an invalid date string", async () => {

    const res = await request(app)
      .get("/api/reports/clinic-summary?startDate=not-a-date&endDate=2026-06-30")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(400);

  });


  it("rejects a range where startDate is after endDate", async () => {

    const res = await request(app)
      .get("/api/reports/clinic-summary?startDate=2026-06-30&endDate=2026-06-01")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/startDate must be before endDate/i);

  });


  it("generates a valid docx for a custom range that includes the test visit", async () => {

    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    const res = await request(app)
      .get(`/api/reports/clinic-summary?startDate=${startDate}&endDate=${endDate}`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);

    expect(isValidDocxBuffer(res.body)).toBe(true);

    // Sanity-check that the populated report contains more than placeholders.
    expect(res.body.length).toBeGreaterThan(3000);

  });

});

describe("CSV report exports", () => {
  it.each([
    ["inventory-current", "Medicine"],
    ["inventory-movements", "Transaction Type"],
    ["inventory-batches", "Batch Number"],
    ["inventory-reorder", "Suggested Order Quantity"],
    ["medication-consumption", "Quantity Dispensed"],
    ["medication-usage-details", "Recorded / Dispensed By"],
  ])("exports the %s report", async (reportType, expectedHeader) => {
    const token = reportType === "medication-usage-details" ? doctorToken : nurseToken;
    const res = await request(app)
      .get(`/api/reports/export/${reportType}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain(expectedHeader);
  });

  it.each(["medication-usage-details", "vaccination-status"])(
    "blocks admin from the identifiable %s report",
    async (reportType) => {
      const res = await request(app)
        .get(`/api/reports/export/${reportType}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/access denied/i);
    },
  );

  it("exports the medication inventory columns requested by the clinic", async () => {
    const res = await request(app)
      .get("/api/reports/export/medication-inventory")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/Medication_Inventory_Report/);
    expect(res.text).toContain("Name of Medication");
    expect(res.text).toContain("Date Medication Received");
    expect(res.text).toContain("Total Number Prescribed");
    expect(res.text).toContain("Total Remaining Stock On Hand");
    expect(res.text).toContain("Expiration Date");
    expect(res.text).toContain("Remarks");
  });

  it("exports inventory stock as a CSV attachment", async () => {
    const res = await request(app)
      .get("/api/reports/export/inventory-stock")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/Inventory_Stock/);
    expect(res.text).toContain("Medicine");
    expect(res.text).toContain("Low Stock Threshold");
  });

  it("rejects an unsupported export type", async () => {
    const res = await request(app)
      .get("/api/reports/export/not-a-report")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unsupported/i);
  });
});

describe("Annual medication report", () => {
  it("exports an Excel-compatible school-year medication matrix", async () => {
    const res = await request(app)
      .get("/api/reports/annual-medication")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/vnd\.ms-excel/);
    expect(res.headers["content-disposition"]).toMatch(/Annual_Medication_/);
    expect(res.text).toContain("ANNUAL MEDICATION");
    expect(res.text).toContain("Name of Medication");
    expect(res.text).toContain(">July</th>");
    expect(res.text).toContain("Total Stocks");
    expect(res.text).toContain("Total Remaining");
  });
});

describe("Visit report period headings", () => {
  const start = new Date("2026-08-10T00:00:00.000Z");
  const end = new Date("2026-08-10T23:59:59.999Z");

  it("uses a daily title and exact reporting date", () => {
    expect(getReportTitle(start, end, "daily")).toBe("DAILY MEDICAL CASE REPORT");
    expect(formatReportPeriodLabel(start, end, "daily")).toBe("August 10, 2026");
  });

  it("uses the explicitly selected weekly, monthly, and yearly titles", () => {
    expect(getReportTitle(start, end, "weekly")).toBe("WEEKLY MEDICAL CASE REPORT");
    expect(getReportTitle(start, end, "monthly")).toBe("MONTHLY MEDICAL CASE REPORT");
    expect(getReportTitle(start, end, "yearly")).toBe("YEARLY MEDICAL CASE REPORT");
  });
});

describe("Admin dashboard privacy", () => {
  it("returns aggregate dashboard data without identifiable recent cases", async () => {
    const res = await request(app)
      .get("/api/dashboard/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.todayVisits).toBeGreaterThanOrEqual(1);
    expect(res.body.data.recentCases).toBeUndefined();
    expect(res.body.data.commonComplaints).toBeUndefined();
    expect(res.body.data.monthlyVisits).toBeUndefined();
    expect(res.body.data.analyticsVisitBreakdown).toBeUndefined();
  });
});
