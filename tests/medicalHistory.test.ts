import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import MedicalHistory from "../src/models/medicalHistory.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let doctorToken: string;
let doctorId: string;
let nurseToken: string;
let nurseId: string;

let testPatientId: string;
let createdEntryId: string | null = null;


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
    address: "Test Address"
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