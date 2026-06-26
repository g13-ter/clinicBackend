import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import User from "../src/models/user.model";
import bcrypt from "bcryptjs";

dotenv.config();


// A clearly-marked test account, so it's obvious in the database
// (and easy to clean up) which records belong to automated tests.
const TEST_EMAIL = "TEST_auth_user@clinic.com";
const TEST_PASSWORD = "testpass123";


// runs ONCE before any test in this file - connect to the database
beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  // create one known test user we can log in as during these tests
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, salt);

  await User.create({
    name: "TEST Auth User",
    email: TEST_EMAIL,
    password: hashedPassword,
    role: "staff"
  });

});


// runs ONCE after all tests in this file finish - clean up
// exactly the test data we created, nothing else
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

  });


  it("rejects login with wrong password", async () => {

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: TEST_EMAIL,
        password: "wrongpassword"
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid password");

  });


  it("rejects login for an email that doesn't exist", async () => {

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "doesnotexist@clinic.com",
        password: "anything123"
      });

    expect(res.status).toBe(404);

  });

});


describe("Auth - Security", () => {

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

});