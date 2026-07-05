import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";

dotenv.config();

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe("Health check", () => {
  it("returns ok when the database is connected", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("connected");
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body.timestamp).toBeDefined();
  });

  it("does not require authentication", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });
});
