import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import MedicalHistory from "../src/models/medicalHistory.model";
import ClinicVisit from "../src/models/clinicVisit.model";
import Medicine from "../src/models/medicine.model";
import MedicineDispense from "../src/models/medicineDispense.model";
import StockMovement from "../src/models/stockMovement.model";
import InventoryBatch from "../src/models/inventoryBatch.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let doctorToken: string;
let doctorId: string;
let nurseToken: string;
let nurseId: string;

let testPatientId: string;
let createdEntryId: string | null = null;
const createdVisitIds: string[] = [];
const createdMedicineIds: string[] = [];
const createdBatchIds: string[] = [];


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const doctor = await createTestUserAndLogin("doctor", "history_doctor");
  doctorToken = doctor.token;
  doctorId = doctor.userId;

  const nurse = await createTestUserAndLogin("nurse", "history_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

  const patient = await Patient.create({
    studentId: `TEST-HISTORY-${Date.now()}`,
    firstName: "TEST",
    lastName: "HistoryPatient",
    age: 21,
    gender: "Male",
    course: "BSIT",
    yearLevel: 3,
    contactNumber: "09171234567",
    address: "Test Address",
  });

  testPatientId = (patient._id as any).toString();

});


afterAll(async () => {

  await deleteTestUser(doctorId);
  await deleteTestUser(nurseId);

  await Patient.findByIdAndDelete(testPatientId);

  if (createdEntryId) {
    await MedicalHistory.findByIdAndDelete(createdEntryId);
  }

  await MedicalHistory.deleteMany({ visitId: { $in: createdVisitIds } });
  await MedicineDispense.deleteMany({ visitId: { $in: createdVisitIds } });
  await StockMovement.deleteMany({ visitId: { $in: createdVisitIds } });
  await ClinicVisit.deleteMany({ _id: { $in: createdVisitIds } });
  await Medicine.deleteMany({ _id: { $in: createdMedicineIds } });
  await InventoryBatch.deleteMany({ _id: { $in: createdBatchIds } });

  await mongoose.connection.close();

});


describe("Medical History - Create (doctor only)", () => {

  it("allows a DOCTOR to add a diagnosis entry", async () => {

    const res = await request(app)
      .post("/api/medical-history")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        patientId: testPatientId,
        diagnosis: "Common cold",
        prescription: "Paracetamol 500mg",
        allergies: "None"
      });

    expect(res.status).toBe(201);

    createdEntryId = res.body.data._id;

  });

  it("allows a DOCTOR to generate a certificate from a saved consultation", async () => {
    const res = await request(app)
      .get(`/api/medical-history/${createdEntryId}/certificate`)
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.headers["content-disposition"]).toContain("Consultation_Certificate_");
  });

  it("blocks a NURSE from generating a physician consultation certificate", async () => {
    const res = await request(app)
      .get(`/api/medical-history/${createdEntryId}/certificate`)
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(403);
  });


  it("allows a family-history-only entry with no diagnosis", async () => {

    const res = await request(app)
      .post("/api/medical-history")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        patientId: testPatientId,
        familyHistory: "Mother has asthma"
      });

    expect(res.status).toBe(201);
    expect(res.body.data.familyHistory).toBe("Mother has asthma");

    // clean this extra one up immediately, separate from the main tracked entry
    await MedicalHistory.findByIdAndDelete(res.body.data._id);

  });

  it("saves a consultation and deducts prescribed stock only once", async () => {
    const visit = await ClinicVisit.create({
      patientId: testPatientId,
      complaint: "TEST idempotent consultation",
      status: "in_consultation",
      recordedBy: doctorId,
      assignedDoctorId: doctorId,
      readyForDoctor: true,
      isActive: true,
    });
    const medicine = await Medicine.create({
      name: `TEST Paracetamol ${Date.now()}`,
      quantity: 20,
      unit: "tablets",
      lowStockThreshold: 5,
      expiryDate: new Date("2030-01-01"),
      lastUpdatedBy: doctorId,
    });
    const visitId = String(visit._id);
    const medicineId = String(medicine._id);
    createdVisitIds.push(visitId);
    createdMedicineIds.push(medicineId);

    const body = {
      patientId: testPatientId,
      visitId,
      diagnosis: "Tension headache",
      prescription: "Take after food",
      prescribedItems: [{ medicineId, quantity: 2, instructions: "Every 8 hours" }],
    };

    const first = await request(app)
      .post("/api/medical-history")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send(body);
    const duplicate = await request(app)
      .post("/api/medical-history")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send(body);

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(await MedicalHistory.countDocuments({ visitId })).toBe(1);
    expect(await MedicineDispense.countDocuments({ visitId })).toBe(1);
    expect((await Medicine.findById(medicineId))?.quantity).toBe(18);
    expect((await ClinicVisit.findById(visitId))?.status).toBe("completed");
  });

  it("dispenses from the earliest-expiring batch first", async () => {
    const visit = await ClinicVisit.create({
      patientId: testPatientId,
      complaint: "TEST FEFO consultation",
      status: "in_consultation",
      recordedBy: doctorId,
      assignedDoctorId: doctorId,
      readyForDoctor: true,
      isActive: true,
    });
    const medicine = await Medicine.create({
      name: `TEST FEFO Medicine ${Date.now()}`,
      quantity: 10,
      unit: "tablets",
      lowStockThreshold: 2,
      lastUpdatedBy: doctorId,
    });
    const [earlierBatch, laterBatch] = await InventoryBatch.create([
      {
        medicineId: medicine._id,
        batchNumber: `FEFO-EARLY-${Date.now()}`,
        quantityReceived: 4,
        quantityRemaining: 4,
        expiryDate: new Date("2030-01-01"),
        receivedBy: nurseId,
      },
      {
        medicineId: medicine._id,
        batchNumber: `FEFO-LATE-${Date.now()}`,
        quantityReceived: 6,
        quantityRemaining: 6,
        expiryDate: new Date("2031-01-01"),
        receivedBy: nurseId,
      },
    ]);
    const visitId = String(visit._id);
    const medicineId = String(medicine._id);
    createdVisitIds.push(visitId);
    createdMedicineIds.push(medicineId);
    createdBatchIds.push(String(earlierBatch._id), String(laterBatch._id));

    const response = await request(app)
      .post("/api/medical-history")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        patientId: testPatientId,
        visitId,
        diagnosis: "Test diagnosis",
        prescribedItems: [{ medicineId, quantity: 5, instructions: "Test only" }],
      });

    expect(response.status).toBe(201);
    expect((await InventoryBatch.findById(earlierBatch._id))?.quantityRemaining).toBe(0);
    expect((await InventoryBatch.findById(laterBatch._id))?.quantityRemaining).toBe(5);
    expect((await Medicine.findById(medicineId))?.quantity).toBe(5);
    const dispense = await MedicineDispense.findOne({ visitId });
    expect(dispense?.batchAllocations).toHaveLength(2);
    const movement = await StockMovement.findOne({ visitId, type: "dispensed" });
    expect(movement?.quantityChange).toBe(-5);
    expect(movement?.balanceAfter).toBe(5);
  });


  it("blocks a NURSE from creating a medical history entry (read-only role)", async () => {

    const res = await request(app)
      .post("/api/medical-history")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        patientId: testPatientId,
        diagnosis: "Should not be allowed"
      });

    expect(res.status).toBe(403);

  });

});


describe("Medical History - View permissions", () => {

  it("NURSE can view history (read-only)", async () => {

    const res = await request(app)
      .get(`/api/medical-history/patient/${testPatientId}`)
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

  });

});


describe("Medical History - Update (doctor only)", () => {

  it("blocks a NURSE from updating an entry", async () => {

    const res = await request(app)
      .put(`/api/medical-history/${createdEntryId}`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        diagnosis: "Should not be allowed to change this"
      });

    expect(res.status).toBe(403);

  });


  it("allows a DOCTOR to update their entry", async () => {

    const res = await request(app)
      .put(`/api/medical-history/${createdEntryId}`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        diagnosis: "Common cold (resolved)"
      });

    expect(res.status).toBe(200);
    expect(res.body.data.diagnosis).toBe("Common cold (resolved)");

  });

});
