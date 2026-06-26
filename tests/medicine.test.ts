import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Medicine from "../src/models/medicine.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let nurseToken: string;
let nurseId: string;
let doctorToken: string;
let doctorId: string;
let staffToken: string;
let staffId: string;

let createdMedicineId: string | null = null;


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const nurse = await createTestUserAndLogin("nurse", "med_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

  const doctor = await createTestUserAndLogin("doctor", "med_doctor");
  doctorToken = doctor.token;
  doctorId = doctor.userId;

  const staff = await createTestUserAndLogin("staff", "med_staff");
  staffToken = staff.token;
  staffId = staff.userId;

});


afterAll(async () => {

  await deleteTestUser(nurseId);
  await deleteTestUser(doctorId);
  await deleteTestUser(staffId);

  if (createdMedicineId) {
    await Medicine.findByIdAndDelete(createdMedicineId);
  }

  await mongoose.connection.close();

});


describe("Medicine Inventory - Create (nurse only)", () => {

  it("allows a NURSE to add a medicine below the low-stock threshold", async () => {

    const res = await request(app)
      .post("/api/medicines")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        name: `TEST Paracetamol ${Date.now()}`,
        quantity: 5,
        unit: "tablets",
        lowStockThreshold: 10
      });

    expect(res.status).toBe(201);

    createdMedicineId = res.body.medicine._id;

  });


  it("blocks STAFF from adding medicine", async () => {

    const res = await request(app)
      .post("/api/medicines")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        name: "Should not be allowed",
        quantity: 10,
        unit: "tablets"
      });

    expect(res.status).toBe(403);

  });


  it("rejects negative quantity (validation)", async () => {

    const res = await request(app)
      .post("/api/medicines")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        name: "Invalid Medicine",
        quantity: -5,
        unit: "tablets"
      });

    expect(res.status).toBe(400);

  });

});


describe("Medicine Inventory - Low stock detection", () => {

  it("flags the medicine as low stock in the full list", async () => {

    const res = await request(app)
      .get("/api/medicines")
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);

    const found = res.body.find(
      (m: any) => m._id === createdMedicineId
    );

    expect(found).toBeDefined();
    expect(found.isLowStock).toBe(true);

  });


  it("includes the medicine in the dedicated low-stock endpoint", async () => {

    const res = await request(app)
      .get("/api/medicines/low-stock")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(200);

    const found = res.body.find(
      (m: any) => m._id === createdMedicineId
    );

    expect(found).toBeDefined();

  });


  it("clears the low-stock flag once restocked above the threshold", async () => {

    const updateRes = await request(app)
      .put(`/api/medicines/${createdMedicineId}`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ quantity: 100 });

    expect(updateRes.status).toBe(200);

    const listRes = await request(app)
      .get("/api/medicines")
      .set("Authorization", `Bearer ${nurseToken}`);

    const found = listRes.body.find(
      (m: any) => m._id === createdMedicineId
    );

    expect(found.isLowStock).toBe(false);

  });

});