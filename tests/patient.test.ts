import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let adminToken: string;
let adminId: string;
let doctorToken: string;
let doctorId: string;
let nurseToken: string;
let nurseId: string;
let staffToken: string;
let staffId: string;

let createdPatientId: string | null = null;


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const admin = await createTestUserAndLogin("admin", "patients_admin");
  adminToken = admin.token;
  adminId = admin.userId;

  const doctor = await createTestUserAndLogin("doctor", "patients_doctor");
  doctorToken = doctor.token;
  doctorId = doctor.userId;

  const nurse = await createTestUserAndLogin("nurse", "patients_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

  const staff = await createTestUserAndLogin("staff", "patients_staff");
  staffToken = staff.token;
  staffId = staff.userId;

});


afterAll(async () => {

  await deleteTestUser(adminId);
  await deleteTestUser(doctorId);
  await deleteTestUser(nurseId);
  await deleteTestUser(staffId);

  if (createdPatientId) {
    await Patient.findByIdAndDelete(createdPatientId);
  }

  await mongoose.connection.close();

});


describe("Patients - Create (nurse only)", () => {

  it("allows a NURSE to create a patient", async () => {

    const res = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        studentId: `TEST-${Date.now()}`,
        firstName: "TEST",
        lastName: "Patient",
        age: 20,
        gender: "Male",
        course: "BSIT",
        yearLevel: 2,
        contactNumber: "09171234567",
        address: "Test Address"
      });

    expect(res.status).toBe(201);

    createdPatientId = res.body.data._id;

  });


  it("blocks a DOCTOR from creating a patient", async () => {

    const res = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        studentId: `TEST-${Date.now()}`,
        firstName: "TEST",
        lastName: "Should Fail",
        age: 20,
        gender: "Male",
        course: "BSIT",
        yearLevel: 2,
        contactNumber: "09171234567",
        address: "Test Address"
      });

    expect(res.status).toBe(403);

  });


  it("blocks STAFF from creating a patient", async () => {

    const res = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        studentId: `TEST-${Date.now()}`,
        firstName: "TEST",
        lastName: "Should Fail",
        age: 20,
        gender: "Male",
        course: "BSIT",
        yearLevel: 2,
        contactNumber: "09171234567",
        address: "Test Address"
      });

    expect(res.status).toBe(403);

  });

});


describe("Patients - View permissions differ by role", () => {

  it("DOCTOR sees full patient info", async () => {

    const res = await request(app)
      .get(`/api/patients/${createdPatientId}`)
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.contactNumber).toBeDefined();
    expect(res.body.data.address).toBeDefined();

  });


  it("STAFF only sees basic info, never contact/address", async () => {

    const res = await request(app)
      .get("/api/patients/basic")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const found = res.body.data.find(
      (p: any) => p._id === createdPatientId
    );

    expect(found).toBeDefined();
    expect(found.contactNumber).toBeUndefined();
    expect(found.address).toBeUndefined();

  });


  it("STAFF is blocked from the full patient list", async () => {

    const res = await request(app)
      .get("/api/patients")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(403);

  });

});


describe("Patients - Archive instead of delete (admin only)", () => {

  it("blocks a NURSE from archiving a patient", async () => {

    const res = await request(app)
      .delete(`/api/patients/${createdPatientId}`)
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(403);

  });


  it("allows ADMIN to archive a patient, which hides it from the active list", async () => {

    const archiveRes = await request(app)
      .delete(`/api/patients/${createdPatientId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(archiveRes.status).toBe(200);

    // confirm it no longer shows up in the default (active-only) list
    const listRes = await request(app)
      .get("/api/patients")
      .set("Authorization", `Bearer ${nurseToken}`);

    const stillVisible = listRes.body.data.find(
      (p: any) => p._id === createdPatientId
    );

    expect(stillVisible).toBeUndefined();

    // confirm it's still in the database when explicitly asked for
    const includeInactiveRes = await request(app)
      .get("/api/patients?includeInactive=true")
      .set("Authorization", `Bearer ${nurseToken}`);

    const stillExists = includeInactiveRes.body.data.find(
      (p: any) => p._id === createdPatientId
    );

    expect(stillExists).toBeDefined();
    expect(stillExists.isActive).toBe(false);

  });

});