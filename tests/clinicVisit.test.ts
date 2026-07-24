import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import ClinicVisit from "../src/models/clinicVisit.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let adminToken: string;
let adminId: string;
let doctorToken: string;
let doctorId: string;
let nurseToken: string;
let nurseId: string;

let testPatientId: string;
let createdVisitId: string | null = null;


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const admin = await createTestUserAndLogin("admin", "visits_admin");
  adminToken = admin.token;
  adminId = admin.userId;

  const doctor = await createTestUserAndLogin("doctor", "visits_doctor");
  doctorToken = doctor.token;
  doctorId = doctor.userId;

  const nurse = await createTestUserAndLogin("nurse", "visits_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

  // create one real patient directly, to attach visits to
  const patient = await Patient.create({
    studentId: `TEST-VISIT-${Date.now()}`,
    firstName: "TEST",
    lastName: "VisitPatient",
    age: 19,
    gender: "Female",
    course: "BSN",
    yearLevel: 1,
    contactNumber: "09171234567",
    address: "Test Address"
  });

  testPatientId = (patient._id as any).toString();

});


afterAll(async () => {

  await deleteTestUser(adminId);
  await deleteTestUser(doctorId);
  await deleteTestUser(nurseId);

  await Patient.findByIdAndDelete(testPatientId);

  if (createdVisitId) {
    await ClinicVisit.findByIdAndDelete(createdVisitId);
  }

  await mongoose.connection.close();

});


describe("Clinic Visits - Create (nurse only)", () => {

  it("allows a NURSE to log a visit with vitals", async () => {

    const res = await request(app)
      .post("/api/visits")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        patientId: testPatientId,
        complaint: "Headache and mild fever",
        treatment: "Paracetamol given",
        notes: "Advised to rest",
        bloodPressure: "120/80",
        temperature: 37.8,
        pulseRate: 88
      });

    expect(res.status).toBe(201);
    expect(res.body.data.bloodPressure).toBe("120/80");
    expect(res.body.data.temperature).toBe(37.8);

    createdVisitId = res.body.data._id;

  });


  it("blocks a DOCTOR from creating a visit (view only role)", async () => {

    const res = await request(app)
      .post("/api/visits")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        patientId: testPatientId,
        complaint: "Should not be allowed"
      });

    expect(res.status).toBe(403);

  });


  it("rejects a visit with no complaint (validation)", async () => {

    const res = await request(app)
      .post("/api/visits")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        patientId: testPatientId
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");

  });

});


describe("Clinic Visits - View permissions", () => {

  it("DOCTOR can view visits for a patient", async () => {

    const res = await request(app)
      .get(`/api/visits/patient/${testPatientId}`)
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

  });


  it("blocks ADMIN from viewing clinic visits (medical data)", async () => {

    const res = await request(app)
      .get(`/api/visits/patient/${testPatientId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(403);

  });

});


describe("Clinic Visits - Archive (admin only)", () => {

  it("blocks a NURSE from archiving a visit", async () => {

    const res = await request(app)
      .delete(`/api/visits/${createdVisitId}`)
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(403);

  });


  it("allows ADMIN to archive a visit", async () => {

    const res = await request(app)
      .delete(`/api/visits/${createdVisitId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    // confirm it no longer shows up for the patient
    const listRes = await request(app)
      .get(`/api/visits/patient/${testPatientId}`)
      .set("Authorization", `Bearer ${nurseToken}`);

    const stillVisible = listRes.body.data.find(
      (v: any) => v._id === createdVisitId
    );

    expect(stillVisible).toBeUndefined();

  });

});