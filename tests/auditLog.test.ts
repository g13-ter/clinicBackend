import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import User from "../src/models/user.model";
import AuditLog from "../src/models/auditLog.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let adminToken: string;
let adminId: string;
let nurseToken: string;
let nurseId: string;

let createdPatientId: string | null = null;
let createdStaffUserId: string | null = null;

// Audit log writes are fire-and-forget (the controller does not await
// them), so a write can still be in flight when the very next request
// checks for it. This small helper polls a few times instead of
// asserting immediately - it's testing for "the entry shows up shortly
// after", which is the real, honest behavior of this system.
const waitForAuditEntry = async (
  filterQuery: string,
  token: string,
  maxAttempts = 5
): Promise<any | undefined> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await request(app)
      .get(`/api/audit-logs?${filterQuery}`)
      .set("Authorization", `Bearer ${token}`);

    if (res.body.data && res.body.data.length > 0) {
      return res.body.data[0];
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return undefined;
};


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const admin = await createTestUserAndLogin("admin", "audit_admin");
  adminToken = admin.token;
  adminId = admin.userId;

  const nurse = await createTestUserAndLogin("nurse", "audit_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

});


afterAll(async () => {

  await deleteTestUser(adminId);
  await deleteTestUser(nurseId);

  if (createdPatientId) {
    await Patient.findByIdAndDelete(createdPatientId);
    await AuditLog.deleteMany({ resourceId: createdPatientId });
  }

  if (createdStaffUserId) {
    await User.findByIdAndDelete(createdStaffUserId);
    await AuditLog.deleteMany({ resourceId: createdStaffUserId });
  }

  await mongoose.connection.close();

});


describe("Audit Logs - access control", () => {

  it("blocks a NURSE from viewing audit logs", async () => {

    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(403);

  });


  it("blocks an unauthenticated request", async () => {

    const res = await request(app).get("/api/audit-logs");

    expect(res.status).toBe(401);

  });


  it("allows an ADMIN to view audit logs", async () => {

    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();

  });

});


describe("Audit Logs - real actions get recorded", () => {

  it("records a create action when a nurse creates a patient", async () => {

    const createRes = await request(app)
      .post("/api/patients")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        studentId: `TEST-AUDIT-${Date.now()}`,
        firstName: "Audit",
        lastName: "TestPatient",
        age: 20,
        gender: "Female",
        course: "BSN",
        yearLevel: 2,
        contactNumber: "09171234567",
        address: "Test Address"
      });

    expect(createRes.status).toBe(201);
    createdPatientId = createRes.body.data._id;

    const entry = await waitForAuditEntry(
      `resource=Patient&resourceId=${createdPatientId}&action=create`,
      adminToken
    );

    expect(entry).toBeDefined();
    expect(entry.action).toBe("create");
    expect(entry.resource).toBe("Patient");
    expect(entry.resourceId).toBe(createdPatientId);
    expect(entry.changes.after.firstName).toBe("Audit");
    // performedBy gets populated with name/role - confirm it's the nurse who created it
    expect(entry.performedBy._id).toBe(nurseId);

  });


  it("records a view action when the patient is fetched by id", async () => {

    const viewRes = await request(app)
      .get(`/api/patients/${createdPatientId}`)
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(viewRes.status).toBe(200);

    const entry = await waitForAuditEntry(
      `resource=Patient&resourceId=${createdPatientId}&action=view`,
      adminToken
    );

    expect(entry).toBeDefined();
    expect(entry.action).toBe("view");

  });


  it("records an update action with both before and after snapshots", async () => {

    const updateRes = await request(app)
      .put(`/api/patients/${createdPatientId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ firstName: "AuditUpdated" });

    expect(updateRes.status).toBe(200);

    const entry = await waitForAuditEntry(
      `resource=Patient&resourceId=${createdPatientId}&action=update`,
      adminToken
    );

    expect(entry).toBeDefined();
    expect(entry.changes.before.firstName).toBe("Audit");
    expect(entry.changes.after.firstName).toBe("AuditUpdated");

  });


  it("records a delete action when the patient is archived", async () => {

    const archiveRes = await request(app)
      .delete(`/api/patients/${createdPatientId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(archiveRes.status).toBe(200);

    const entry = await waitForAuditEntry(
      `resource=Patient&resourceId=${createdPatientId}&action=delete`,
      adminToken
    );

    expect(entry).toBeDefined();
    expect(entry.changes.before.isActive).toBe(true);
    expect(entry.changes.after.isActive).toBe(false);

  });

});


describe("Audit Logs - filtering and pagination", () => {

  it("filters correctly by performedBy", async () => {

    const res = await request(app)
      .get(`/api/audit-logs?performedBy=${nurseId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    // every entry returned should actually belong to this nurse
    const allMatch = res.body.data.every(
      (log: any) => log.performedBy._id === nurseId
    );
    expect(allMatch).toBe(true);

  });


  it("respects the limit query param", async () => {

    const res = await request(app)
      .get("/api/audit-logs?limit=1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.limit).toBe(1);

  });

});


describe("Audit Logs - sensitive data is never exposed", () => {

  it("never includes a password field, even when a User record changes", async () => {

    const createRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "TEST Audit Staff",
        email: `TEST_audit_staff_${Date.now()}@clinic.com`,
        password: "somepassword123",
        role: "staff"
      });

    expect(createRes.status).toBe(201);
    createdStaffUserId = createRes.body.data._id;

    const entry = await waitForAuditEntry(
      `resource=User&resourceId=${createdStaffUserId}&action=create`,
      adminToken
    );

    expect(entry).toBeDefined();
    expect(entry.changes.after.password).toBeUndefined();

  });

});