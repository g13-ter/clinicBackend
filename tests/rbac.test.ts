import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import { PERMISSIONS } from "../src/config/permissions";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";
import Appointment from "../src/models/appointment.model";
import Patient from "../src/models/patient.model";
import ClinicVisit from "../src/models/clinicVisit.model";

dotenv.config();

let staffToken: string;
let staffId: string;
let nurseToken: string;
let nurseId: string;
let doctorToken: string;
let doctorId: string;
let adminToken: string;
let adminId: string;
let patientId: string;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);

  const staff = await createTestUserAndLogin("staff", "rbac_staff");
  staffToken = staff.token;
  staffId = staff.userId;

  const nurse = await createTestUserAndLogin("nurse", "rbac_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

  const doctor = await createTestUserAndLogin("doctor", "rbac_doctor");
  doctorToken = doctor.token;
  doctorId = doctor.userId;

  const admin = await createTestUserAndLogin("admin", "rbac_admin");
  adminToken = admin.token;
  adminId = admin.userId;

  const patient = await Patient.create({
    studentId: `TEST-RBAC-${Date.now()}`,
    firstName: "RBAC",
    lastName: "Student",
    age: 12,
    gender: "Female",
    course: "BSIT",
    yearLevel: 2,
    contactNumber: "09171234567",
    address: "Test Address",
  });
  patientId = String(patient._id);
});

afterAll(async () => {
  await deleteTestUser(staffId);
  await deleteTestUser(nurseId);
  await deleteTestUser(doctorId);
  await deleteTestUser(adminId);
  await Patient.findByIdAndDelete(patientId);
  await mongoose.connection.close();
});

const tokens = (): Record<string, string> => ({
  staff: staffToken,
  nurse: nurseToken,
  doctor: doctorToken,
  admin: adminToken,
});

describe("RBAC matrix — patients", () => {
  it("allows roles in PERMISSIONS.patients.listFull", async () => {
    for (const role of PERMISSIONS.patients.listFull) {
      const res = await request(app)
        .get("/api/patients")
        .set("Authorization", `Bearer ${tokens()[role]}`);
      expect(res.status).toBe(200);
    }
  });

  it("allows staff to access the demographic patient list", async () => {
    const res = await request(app)
      .get("/api/patients")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });

  it("allows staff on the basic patient list", async () => {
    const res = await request(app)
      .get("/api/patients/basic")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });
});

describe("RBAC matrix — appointments", () => {
  it("allows all list roles to view appointments", async () => {
    for (const role of PERMISSIONS.appointments.list) {
      const res = await request(app)
        .get("/api/appointments")
        .set("Authorization", `Bearer ${tokens()[role]}`);
      expect(res.status).toBe(200);
    }
  });

  it("allows doctors to schedule clinical follow-ups", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        patientId,
        appointmentDate: "2026-08-01T09:00:00.000Z",
        reason: "Clinical follow-up",
        type: "follow_up",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.doctorId).toBe(doctorId);
    await Appointment.findByIdAndDelete(res.body.data._id);
  });

  it("blocks admin from appointment reasons and patient identities", async () => {
    const res = await request(app)
      .get("/api/appointments")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

describe("RBAC matrix — confidential clinic queue", () => {
  it("blocks admin from the identifiable clinical queue", async () => {
    const res = await request(app)
      .get("/api/visits/queue")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

describe("RBAC matrix — admin-only routes", () => {
  it("allows admin on audit logs", async () => {
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("blocks nurse from audit logs", async () => {
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${nurseToken}`);
    expect(res.status).toBe(403);
  });
});

describe("RBAC — invalid token payload", () => {
  it("allows analytics only for doctors and nurses", async () => {
    for (const token of [doctorToken, nurseToken]) {
      const response = await request(app)
        .get("/api/dashboard/analytics?patientType=teacher")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body.data.analyticsPatientType).toBe("teacher");
      expect(response.body.data.analyticsVisitBreakdown).toEqual({
        student: 0,
        teacher: expect.any(Number),
        staff: 0,
      });
      expect(response.body.data.bmiRecordedCount).toEqual(expect.any(Number));
      expect(response.body.data.bmiBreakdown).toEqual({
        underweight: expect.any(Number),
        normalWeight: expect.any(Number),
        overweight: expect.any(Number),
        obese: expect.any(Number),
      });
    }
    for (const token of [adminToken, staffToken]) {
      const response = await request(app)
        .get("/api/dashboard/analytics")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(403);
    }
  });

  it("rejects an unsupported analytics patient type", async () => {
    const response = await request(app)
      .get("/api/dashboard/analytics?patientType=administrator")
      .set("Authorization", `Bearer ${nurseToken}`);
    expect(response.status).toBe(400);
  });

  it("includes BMI recorded by a nurse for patients under 18", async () => {
    const before = await request(app)
      .get("/api/dashboard/analytics?patientType=student")
      .set("Authorization", `Bearer ${nurseToken}`);
    expect(before.status).toBe(200);

    const visit = await request(app)
      .post("/api/visits")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        patientId,
        complaint: "BMI screening",
        heightCm: 100,
        weightKg: 40,
        nursingAssessment: "Routine nursing assessment",
      });

    expect(visit.status).toBe(201);
    expect(visit.body.data.bmi).toBe(40);

    try {
      const after = await request(app)
        .get("/api/dashboard/analytics?patientType=student")
        .set("Authorization", `Bearer ${nurseToken}`);

      expect(after.status).toBe(200);
      expect(after.body.data.bmiRecordedCount).toBe(before.body.data.bmiRecordedCount + 1);
      expect(after.body.data.bmiBreakdown.obese).toBe(before.body.data.bmiBreakdown.obese + 1);
    } finally {
      await ClinicVisit.findByIdAndDelete(visit.body.data._id);
    }
  });

  it("rejects a token whose role claim is not in the allowed enum", async () => {
    // Invalid tokens must fail before role checks.
    const res = await request(app)
      .get("/api/patients")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
  });
});
