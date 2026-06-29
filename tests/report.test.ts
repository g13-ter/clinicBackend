import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import ClinicVisit from "../src/models/clinicVisit.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

// Supertest/superagent does not automatically buffer unrecognized binary
// content types (like our .docx mimetype) into res.body as a real
// Buffer - without this, res.body comes back as an empty object and
// any attempt to read it fails silently. This custom parser collects
// the raw response bytes ourselves instead of relying on the default
// JSON/text parsing path.
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

let testPatientId: string;
let testVisitId: string;

// A .docx file is a ZIP archive under the hood. Every ZIP file starts
// with this exact 2-byte signature ("PK"). Checking for it is a cheap,
// reliable way to confirm the response is a real binary file and not,
// say, an error page or empty buffer - without needing to fully parse
// the document's XML contents.
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

  // one real patient + one real visit, so the report has actual data
  // to summarize rather than testing only the empty-state path
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

  await ClinicVisit.findByIdAndDelete(testVisitId);
  await Patient.findByIdAndDelete(testPatientId);

  await mongoose.connection.close();

});


describe("Clinic Summary Report - access control", () => {

  it("blocks a NURSE from generating the report", async () => {

    const res = await request(app)
      .get("/api/reports/clinic-summary")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(403);

  });


  it("blocks an unauthenticated request", async () => {

    const res = await request(app).get("/api/reports/clinic-summary");

    expect(res.status).toBe(401);

  });

});


describe("Clinic Summary Report - default range (no dates given)", () => {

  it("generates a valid docx file for the current month by default", async () => {

    const res = await request(app)
      .get("/api/reports/clinic-summary")
      .set("Authorization", `Bearer ${adminToken}`)
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
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);

  });


  it("rejects an invalid date string", async () => {

    const res = await request(app)
      .get("/api/reports/clinic-summary?startDate=not-a-date&endDate=2026-06-30")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);

  });


  it("rejects a range where startDate is after endDate", async () => {

    const res = await request(app)
      .get("/api/reports/clinic-summary?startDate=2026-06-30&endDate=2026-06-01")
      .set("Authorization", `Bearer ${adminToken}`);

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
      .set("Authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);

    expect(isValidDocxBuffer(res.body)).toBe(true);

    // a real, populated report should be noticeably larger than a
    // minimal/empty one - this isn't an exact check, just a sanity
    // floor confirming the document actually has the attendance and
    // complaints tables filled in, not just empty placeholder text
    expect(res.body.length).toBeGreaterThan(3000);

  });

});