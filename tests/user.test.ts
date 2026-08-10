import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import User from "../src/models/user.model";
import { createTestUserAndLogin, deleteTestUser, TEST_PASSWORD } from "./helpers";
import AuditLog from "../src/models/auditLog.model";

dotenv.config();

let adminToken: string;
let adminId: string;
let nurseToken: string;
let nurseId: string;
let superAdminToken: string;
let superAdminId: string;
let managedAdminId: string | null = null;

// a user created DURING a test, that we'll clean up afterward
let createdUserId: string | null = null;
let createdUserEmail: string | null = null;
let legacyDoctorId: string | null = null;


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const admin = await createTestUserAndLogin("admin", "users_admin");
  adminToken = admin.token;
  adminId = admin.userId;

  const nurse = await createTestUserAndLogin("nurse", "users_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

  const superAdmin = await createTestUserAndLogin("superadmin", "users_superadmin");
  superAdminToken = superAdmin.token;
  superAdminId = superAdmin.userId;

});


afterAll(async () => {

  await deleteTestUser(adminId);
  await deleteTestUser(nurseId);
  await deleteTestUser(superAdminId);
  if (managedAdminId) await deleteTestUser(managedAdminId);

  if (createdUserId) {
    await deleteTestUser(createdUserId);
  }
  if (legacyDoctorId) {
    await deleteTestUser(legacyDoctorId);
  }

  await mongoose.connection.close();

});


describe("Users - Admin only access", () => {

  it("includes legacy doctors whose active fields predate the current schema", async () => {
    const inserted = await User.collection.insertOne({
      name: "TEST Legacy Doctor",
      email: `TEST_legacy_doctor_${Date.now()}@clinic.com`,
      password: "not-used-by-this-test",
      role: "doctor",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    legacyDoctorId = String(inserted.insertedId);

    const res = await request(app)
      .get("/api/users/doctors")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((doctor: { _id: string }) => doctor._id === legacyDoctorId)).toBe(true);
  });

  it("allows admin to create a new user", async () => {

    createdUserEmail = `TEST_created_${Date.now()}@clinic.com`;
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "TEST Created Staff",
        email: createdUserEmail,
        password: TEST_PASSWORD,
        role: "staff"
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("staff");

    // remember this so afterAll can clean it up
    createdUserId = res.body.data._id;

  });

  it("rejects duplicate emails regardless of letter case", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "TEST Duplicate Staff",
        email: createdUserEmail?.toUpperCase(),
        password: TEST_PASSWORD,
        role: "staff",
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Email already in use");
  });

  it("deactivates accounts without deleting history and revokes their sessions", async () => {
    expect(createdUserId).toBeTruthy();
    expect(createdUserEmail).toBeTruthy();

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: createdUserEmail, password: TEST_PASSWORD });
    const userToken = login.body.token as string;

    const deactivate = await request(app)
      .delete(`/api/users/${createdUserId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deactivate.status).toBe(200);

    const revoked = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${userToken}`);
    expect(revoked.status).toBe(401);

    const preserved = await User.findById(createdUserId).lean();
    expect(preserved).toBeTruthy();
    expect(preserved?.isActive).toBe(false);

    const inactiveList = await request(app)
      .get("/api/users?limit=200")
      .set("Authorization", `Bearer ${adminToken}`);
    const inactiveAccount = inactiveList.body.data.find((user: { _id: string }) => user._id === createdUserId);
    expect(inactiveAccount.deactivatedBy.name).toBeTruthy();

    const reactivate = await request(app)
      .put(`/api/users/${createdUserId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.data.isActive).toBe(true);
  });


  it("blocks a NURSE from creating a new user", async () => {

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        name: "TEST Should Not Be Created",
        email: `TEST_blocked_${Date.now()}@clinic.com`,
        password: TEST_PASSWORD,
        role: "staff"
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Access denied");

  });


  it("allows admin to view the user list", async () => {

    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    // make sure passwords are never sent back, even to an admin
    expect(res.body.data[0].password).toBeUndefined();
    expect(res.body.data.some((user: { role: string }) => user.role === "superadmin")).toBe(false);
    expect(res.body.data.some((user: { role: string }) => user.role === "admin")).toBe(false);

  });

  it("prevents regular admins from seeing or creating privileged accounts", async () => {
    const view = await request(app)
      .get(`/api/users/${superAdminId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(view.status).toBe(403);

    const create = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "TEST Blocked Admin",
        email: `TEST_blocked_admin_${Date.now()}@clinic.com`,
        password: TEST_PASSWORD,
        role: "admin",
      });
    expect(create.status).toBe(403);
  });

  it("allows Super Admin to manage administrative accounts", async () => {
    const create = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        name: "TEST Managed Admin",
        email: `TEST_managed_admin_${Date.now()}@clinic.com`,
        password: TEST_PASSWORD,
        role: "admin",
      });
    expect(create.status).toBe(201);
    managedAdminId = create.body.data._id;

    const deactivate = await request(app)
      .delete(`/api/users/${managedAdminId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.data.isActive).toBe(false);
    expect(deactivate.body.data.deactivatedAt).toBeTruthy();
    expect(String(deactivate.body.data.deactivatedBy)).toBe(superAdminId);

    const reactivate = await request(app)
      .put(`/api/users/${managedAdminId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ isActive: true });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.data.isActive).toBe(true);
  });

  it("prevents and audits Super Admin self-deactivation attempts", async () => {
    const deactivate = await request(app)
      .delete(`/api/users/${superAdminId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(deactivate.status).toBe(400);

    const attempt = await AuditLog.findOne({
      action: "deactivate",
      resource: "User",
      resourceId: superAdminId,
      performedBy: superAdminId,
      "changes.after.successful": false,
    });
    expect(attempt).toBeTruthy();
  });

  it("allows Super Admin to see all account roles", async () => {
    const res = await request(app)
      .get("/api/users?limit=200")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((user: { _id: string }) => user._id === superAdminId)).toBe(true);
    expect(res.body.data.some((user: { role: string }) => user.role === "admin")).toBe(true);
  });


  it("blocks a NURSE from viewing the user list", async () => {

    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(403);

  });


  it("blocks requests with no token at all", async () => {

    const res = await request(app)
      .get("/api/users");

    expect(res.status).toBe(401);

  });

});
