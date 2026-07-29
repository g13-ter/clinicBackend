import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import User from "../src/models/user.model";
import bcrypt from "bcryptjs";

dotenv.config();


// Clearly identify the temporary test account.
const TEST_EMAIL = "TEST_auth_user@clinic.com";
const TEST_PASSWORD = "testpass123";


// Connect once for this suite.
beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  // Create the suite's login user.
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, salt);

  await User.create({
    name: "TEST Auth User",
    email: TEST_EMAIL,
    password: hashedPassword,
    role: "staff"
  });

});


// Remove only this suite's data.
afterAll(async () => {

  await User.deleteOne({ email: TEST_EMAIL });

  await mongoose.connection.close();

});


describe("Auth - Login", () => {

  it("logs in successfully with correct email and password", async () => {

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.headers["set-cookie"]?.[0]).toContain("clinic_session=");
    expect(res.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(res.body.data.user.role).toBe("staff");

  });

  it("restores and clears a browser session using the HttpOnly cookie", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(login.status).toBe(200);

    const active = await agent.get("/api/auth/session");
    expect(active.status).toBe(200);
    expect(active.body.data.user.role).toBe("staff");

    const logout = await agent.post("/api/auth/logout");
    expect(logout.status).toBe(200);

    const ended = await agent.get("/api/auth/session");
    expect(ended.status).toBe(401);
  });


  it("rejects login with wrong password", async () => {

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: TEST_EMAIL,
        password: "wrongpassword"
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");

  });


  it("rejects login for an email that doesn't exist with the same message as wrong password", async () => {

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "doesnotexist@clinic.com",
        password: "anything123"
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");

  });

});


describe("Auth - Security", () => {

  it("allows loopback frontend aliases during local development", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", "http://127.0.0.1:5173")
      .send({ email: TEST_EMAIL, password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
  });

  it("rejects unapproved browser origins with a clear forbidden response", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://malicious.example")
      .send({ email: TEST_EMAIL, password: "wrongpassword" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Request origin is not allowed");
  });

  it("rejects NoSQL injection attempts in the email field", async () => {

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: { "$ne": null },
        password: { "$ne": null }
      });

    // zod should reject this with 400 before it ever reaches MongoDB
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");

  });


  it("has no public /register route (accounts are admin-created only)", async () => {

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Sneaky Person",
        email: "sneaky@clinic.com",
        password: "sneaky123",
        role: "admin"
      });

    // the route shouldn't exist at all - notFoundHandler should catch this
    expect(res.status).toBe(404);

  });

  it("applies a two-minute cooldown after five failed attempts for one account", async () => {
    const email = `rate-limit-${Date.now()}@clinic.com`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "wrongpassword" });
      expect(response.status).toBe(401);
    }

    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "wrongpassword" });

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      "Too many failed login attempts. Please try again in 2 minutes."
    );
    expect(Number(blocked.headers["retry-after"])).toBeLessThanOrEqual(120);
  });

});
