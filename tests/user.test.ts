import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import User from "../src/models/user.model";
import { createTestUserAndLogin, deleteTestUser, TEST_PASSWORD } from "./helpers";

dotenv.config();

let adminToken: string;
let adminId: string;
let nurseToken: string;
let nurseId: string;

// a user created DURING a test, that we'll clean up afterward
let createdUserId: string | null = null;


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const admin = await createTestUserAndLogin("admin", "users_admin");
  adminToken = admin.token;
  adminId = admin.userId;

  const nurse = await createTestUserAndLogin("nurse", "users_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

});


afterAll(async () => {

  await deleteTestUser(adminId);
  await deleteTestUser(nurseId);

  if (createdUserId) {
    await deleteTestUser(createdUserId);
  }

  await mongoose.connection.close();

});


describe("Users - Admin only access", () => {

  it("allows admin to create a new user", async () => {

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "TEST Created Staff",
        email: `TEST_created_${Date.now()}@clinic.com`,
        password: TEST_PASSWORD,
        role: "staff"
      });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("staff");

    // remember this so afterAll can clean it up
    createdUserId = res.body.user._id;

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
    expect(Array.isArray(res.body)).toBe(true);

    // make sure passwords are never sent back, even to an admin
    expect(res.body[0].password).toBeUndefined();

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