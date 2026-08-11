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
let createdStudentId = "";
const staffCreatedPatientIds: string[] = [];


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
  await Patient.deleteMany({ _id: { $in: staffCreatedPatientIds } });

  await mongoose.connection.close();

});


describe("Patients - Create (staff and nurse)", () => {

  it("allows a NURSE to create a patient", async () => {

    createdStudentId = `TEST-${Date.now()}`;
    const res = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        studentId: createdStudentId,
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

  it("rejects a duplicate student ID regardless of spaces or letter case", async () => {
    const duplicateStudentId = `DUPLICATE-${Date.now()}`;
    const original = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        studentId: duplicateStudentId,
        firstName: "Original",
        lastName: "Student",
        age: 20,
        gender: "Male",
        course: "BSIT",
        yearLevel: 2,
        contactNumber: "09171234567",
        address: "Test Address",
      });
    expect(original.status).toBe(201);
    staffCreatedPatientIds.push(original.body.data._id);

    const res = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        studentId: `  ${duplicateStudentId.toLowerCase()}  `,
        firstName: "Duplicate",
        lastName: "Student",
        age: 20,
        gender: "Male",
        course: "BSIT",
        yearLevel: 2,
        contactNumber: "09171234567",
        address: "Test Address",
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already registered/i);
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


  it("allows STAFF to register a patient with guardian contact details", async () => {

    const res = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        studentId: `TEST-${Date.now()}`,
        firstName: "TEST",
        lastName: "StaffRegistered",
        age: 20,
        gender: "Male",
        course: "BSIT",
        yearLevel: 2,
        contactNumber: "09171234567",
        address: "Test Address",
        guardianName: "TEST Guardian",
        guardianContactNumber: "09179999999",
        bloodType: "O+",
        healthConditions: "Should be ignored for staff registration"
      });

    expect(res.status).toBe(201);
    staffCreatedPatientIds.push(res.body.data._id);
    const stored = await Patient.findById(res.body.data._id);
    expect(stored?.guardianName).toBe("TEST Guardian");
    expect(stored?.bloodType).toBeUndefined();
    expect(stored?.healthConditions).toBeUndefined();

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


  it("STAFF can access the demographic patient list", async () => {

    const res = await request(app)
      .get("/api/patients")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).not.toHaveProperty("healthConditions");

  });

  it("calculates age from date of birth instead of trusting submitted age", async () => {
    const today = new Date();
    const birthDate = new Date(Date.UTC(
      today.getUTCFullYear() - 18,
      today.getUTCMonth(),
      today.getUTCDate(),
    ));
    const res = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        studentId: `TEST-DOB-${Date.now()}`,
        firstName: "TEST",
        lastName: "CalculatedAge",
        age: 99,
        dateOfBirth: birthDate.toISOString().slice(0, 10),
        gender: "Female",
        course: "BSIT",
        yearLevel: 1,
        contactNumber: "09171234567",
        address: "Test Address",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.age).toBe(18);
    staffCreatedPatientIds.push(res.body.data._id);
  });

  it("ADMIN receives demographics without confidential medical information", async () => {
    await Patient.findByIdAndUpdate(createdPatientId, {
      bloodType: "O+",
      healthConditions: "Confidential condition",
      medicalAlerts: {
        allergies: ["Confidential allergy"],
        chronicConditions: ["Confidential chronic condition"],
        currentMedications: ["Confidential medication"],
        notes: "Confidential medical note",
      },
    });

    const res = await request(app)
      .get(`/api/patients?search=${encodeURIComponent(createdStudentId)}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const found = res.body.data.find((patient: any) => patient._id === createdPatientId);
    expect(found).toBeDefined();
    expect(found.studentId).toBe(createdStudentId);
    expect(found).not.toHaveProperty("address");
    expect(found).not.toHaveProperty("dateOfBirth");
    expect(found).not.toHaveProperty("guardianName");
    expect(found).not.toHaveProperty("guardianContactNumber");
    expect(found).not.toHaveProperty("bloodType");
    expect(found).not.toHaveProperty("healthConditions");
    expect(found).not.toHaveProperty("medicalAlerts");
  });

});

describe("Patients - reusable clinical profile workflow", () => {
  const nurseProfile = {
    familyHistory: "Mother has diabetes; father has hypertension",
    pastMedicalHistory: "Hospitalized for dengue in 2022",
    allergies: ["Penicillin", "Peanuts"],
    currentMedications: ["Cetirizine as needed"],
    chronicConditions: ["Asthma"],
    notes: "Interviewed during triage",
  };

  it("allows a nurse to record the clinical profile for doctor review", async () => {
    const res = await request(app)
      .put(`/api/patients/${createdPatientId}/clinical-profile`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send(nurseProfile);

    expect(res.status).toBe(200);
    expect(res.body.data.familyHistory).toBe(nurseProfile.familyHistory);
    expect(res.body.data.pastMedicalHistory).toBe(nurseProfile.pastMedicalHistory);
    expect(res.body.data.medicalAlerts.allergies).toEqual(nurseProfile.allergies);
    expect(res.body.data.clinicalProfileVerifiedAt).toBeUndefined();
  });

  it("allows a doctor to correct and verify the nurse-entered profile", async () => {
    const res = await request(app)
      .put(`/api/patients/${createdPatientId}/clinical-profile`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        ...nurseProfile,
        pastMedicalHistory: "Hospitalized for dengue in 2021",
        verified: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.pastMedicalHistory).toContain("2021");
    expect(res.body.data.clinicalProfileVerifiedAt).toBeTruthy();
    expect(res.body.data.clinicalProfileVerifiedBy._id).toBe(doctorId);
  });

  it("returns the profile to review after a nurse changes it", async () => {
    const res = await request(app)
      .put(`/api/patients/${createdPatientId}/clinical-profile`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ ...nurseProfile, currentMedications: ["Salbutamol inhaler"] });

    expect(res.status).toBe(200);
    expect(res.body.data.clinicalProfileVerifiedAt).toBeUndefined();
    expect(res.body.data.clinicalProfileVerifiedBy).toBeUndefined();
  });

  it("blocks staff from viewing or changing clinical-profile fields", async () => {
    const update = await request(app)
      .put(`/api/patients/${createdPatientId}/clinical-profile`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send(nurseProfile);
    const view = await request(app)
      .get(`/api/patients/${createdPatientId}`)
      .set("Authorization", `Bearer ${staffToken}`);

    expect(update.status).toBe(403);
    expect(view.status).toBe(200);
    expect(view.body.data).not.toHaveProperty("familyHistory");
    expect(view.body.data).not.toHaveProperty("pastMedicalHistory");
    expect(view.body.data).not.toHaveProperty("medicalAlerts");
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
      .get(`/api/patients?includeInactive=true&search=${encodeURIComponent(createdStudentId)}&limit=10`)
      .set("Authorization", `Bearer ${nurseToken}`);

    const stillExists = includeInactiveRes.body.data.find(
      (p: any) => p._id === createdPatientId
    );

    expect(stillExists).toBeDefined();
    expect(stillExists.isActive).toBe(false);

  });

});
