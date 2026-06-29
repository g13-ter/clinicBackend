import mongoose from "mongoose";
import dotenv from "dotenv";
import Patient from "../src/models/patient.model";
import ClinicVisit from "../src/models/clinicVisit.model";
import Medicine from "../src/models/medicine.model";
import User from "../src/models/user.model";
import { ReportService } from "../src/services/report.service";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

const reportService = new ReportService();

let nurseId: string;

let malePatientId: string;
let femalePatientId: string;

const createdVisitIds: string[] = [];
const createdMedicineIds: string[] = [];


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const nurse = await createTestUserAndLogin("nurse", "report_svc_nurse");
  nurseId = nurse.userId;

  const malePatient = await Patient.create({
    studentId: `TEST-RSVC-M-${Date.now()}`,
    firstName: "ReportService",
    lastName: "MalePatient",
    age: 17,
    gender: "Male",
    course: "BSIT",
    yearLevel: 1,
    contactNumber: "09171234567",
    address: "Test Address"
  });
  malePatientId = (malePatient._id as any).toString();

  const femalePatient = await Patient.create({
    studentId: `TEST-RSVC-F-${Date.now()}`,
    firstName: "ReportService",
    lastName: "FemalePatient",
    age: 18,
    gender: "Female",
    course: "BSN",
    yearLevel: 2,
    contactNumber: "09171234567",
    address: "Test Address"
  });
  femalePatientId = (femalePatient._id as any).toString();

});


afterAll(async () => {

  await deleteTestUser(nurseId);

  await ClinicVisit.deleteMany({ _id: { $in: createdVisitIds } });
  await Medicine.deleteMany({ _id: { $in: createdMedicineIds } });

  await Patient.findByIdAndDelete(malePatientId);
  await Patient.findByIdAndDelete(femalePatientId);

  await mongoose.connection.close();

});


describe("ReportService - student attendance by gender", () => {

  it("correctly counts visits by the visiting patient's gender", async () => {

    const visit1 = await ClinicVisit.create({
      patientId: malePatientId,
      complaint: "TEST_RSVC_Headache",
      recordedBy: nurseId,
    });
    const visit2 = await ClinicVisit.create({
      patientId: femalePatientId,
      complaint: "TEST_RSVC_Fever",
      recordedBy: nurseId,
    });
    const visit3 = await ClinicVisit.create({
      patientId: femalePatientId,
      complaint: "TEST_RSVC_Headache",
      recordedBy: nurseId,
    });

    createdVisitIds.push(
      (visit1._id as any).toString(),
      (visit2._id as any).toString(),
      (visit3._id as any).toString()
    );

    const startDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const endDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    const stats = await reportService.getClinicSummary(startDate, endDate);

    // these are TEST-prefixed visits added to whatever else may exist
    // in the dev database within this narrow time window, so we check
    // "at least" rather than an exact total
    expect(stats.studentAttendance.male).toBeGreaterThanOrEqual(1);
    expect(stats.studentAttendance.female).toBeGreaterThanOrEqual(2);
    expect(stats.studentAttendance.total).toBeGreaterThanOrEqual(3);
    expect(stats.studentAttendance.total).toBe(
      stats.studentAttendance.male + stats.studentAttendance.female
    );

  });


  it("groups complaints by frequency, most common first", async () => {

    const startDate = new Date(Date.now() - 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 60 * 60 * 1000);

    const stats = await reportService.getClinicSummary(startDate, endDate);

    const headacheEntry = stats.complaintCounts.find(
      (c) => c.complaint === "TEST_RSVC_Headache"
    );
    const feverEntry = stats.complaintCounts.find(
      (c) => c.complaint === "TEST_RSVC_Fever"
    );

    expect(headacheEntry).toBeDefined();
    expect(headacheEntry?.count).toBe(2);
    expect(feverEntry).toBeDefined();
    expect(feverEntry?.count).toBe(1);

    // verify the sort order: headache (2 cases) should appear before
    // fever (1 case) in the results
    const headacheIndex = stats.complaintCounts.findIndex((c) => c.complaint === "TEST_RSVC_Headache");
    const feverIndex = stats.complaintCounts.findIndex((c) => c.complaint === "TEST_RSVC_Fever");
    expect(headacheIndex).toBeLessThan(feverIndex);

  });


  it("excludes archived (isActive: false) visits from the count", async () => {

    const archivedVisit = await ClinicVisit.create({
      patientId: malePatientId,
      complaint: "TEST_RSVC_ShouldNotAppear",
      recordedBy: nurseId,
      isActive: false,
    });
    createdVisitIds.push((archivedVisit._id as any).toString());

    const startDate = new Date(Date.now() - 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 60 * 60 * 1000);

    const stats = await reportService.getClinicSummary(startDate, endDate);

    const found = stats.complaintCounts.find((c) => c.complaint === "TEST_RSVC_ShouldNotAppear");
    expect(found).toBeUndefined();

  });

});


describe("ReportService - medicine stock", () => {

  it("correctly flags items at or below their low-stock threshold", async () => {

    const lowStockMed = await Medicine.create({
      name: `TEST_RSVC_LowStockMed_${Date.now()}`,
      quantity: 3,
      unit: "tablets",
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      lowStockThreshold: 10,
      lastUpdatedBy: nurseId,
    });

    const healthyStockMed = await Medicine.create({
      name: `TEST_RSVC_HealthyStockMed_${Date.now()}`,
      quantity: 500,
      unit: "tablets",
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      lowStockThreshold: 10,
      lastUpdatedBy: nurseId,
    });

    createdMedicineIds.push(
      (lowStockMed._id as any).toString(),
      (healthyStockMed._id as any).toString()
    );

    const startDate = new Date(Date.now() - 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 60 * 60 * 1000);

    const stats = await reportService.getClinicSummary(startDate, endDate);

    const lowStockNames = stats.lowStockMedicines.map((m) => m.name);
    expect(lowStockNames).toContain(lowStockMed.name);
    expect(lowStockNames).not.toContain(healthyStockMed.name);

  });

});


describe("ReportService - validation", () => {

  it("throws if startDate is after endDate", async () => {

    const startDate = new Date("2026-06-30");
    const endDate = new Date("2026-06-01");

    await expect(
      reportService.getClinicSummary(startDate, endDate)
    ).rejects.toThrow("startDate must be before endDate");

  });

});