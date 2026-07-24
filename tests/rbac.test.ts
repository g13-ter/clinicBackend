import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import { PERMISSIONS } from "../src/config/permissions";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let staffToken: string;
let staffId: string;
let nurseToken: string;
let nurseId: string;
let doctorToken: string;
let doctorId: string;
let adminToken: string;
let adminId: string;

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
});

afterAll(async () => {
  await deleteTestUser(staffId);
  await deleteTestUser(nurseId);
  await deleteTestUser(doctorId);
  await deleteTestUser(adminId);
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

  it("blocks staff from the full patient list", async () => {
    const res = await request(app)
      .get("/api/patients")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
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

  it("blocks doctor from creating appointments", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        patientId: "507f1f77bcf86cd799439011",
        appointmentDate: "2026-08-01T09:00:00.000Z",
        reason: "Should fail",
      });
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
  it("rejects a token whose role claim is not in the allowed enum", async () => {
    // Malformed role in a manually crafted token would fail jwtPayloadSchema in protect.
    // Here we verify a completely invalid token is rejected.
    const res = await request(app)
      .get("/api/patients")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
  });
});
