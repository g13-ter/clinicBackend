import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Medicine from "../src/models/medicine.model";
import PurchaseRequest from "../src/models/purchaseRequest.model";
import StockMovement from "../src/models/stockMovement.model";
import InventoryBatch from "../src/models/inventoryBatch.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let nurseToken: string;
let nurseId: string;
let doctorToken: string;
let doctorId: string;
let staffToken: string;
let staffId: string;

let createdMedicineId: string | null = null;
let createdPurchaseRequestId: string | null = null;


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
    await InventoryBatch.deleteMany({ medicineId: createdMedicineId });
    await StockMovement.deleteMany({ medicineId: createdMedicineId });
    await Medicine.findByIdAndDelete(createdMedicineId);
  }
  if (createdPurchaseRequestId) {
    await PurchaseRequest.findByIdAndDelete(createdPurchaseRequestId);
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
        inventorySection: "Tablet Form",
        quantity: 5,
        unit: "tablets",
        lowStockThreshold: 10,
        batchNumber: "TEST-INITIAL-BATCH",
        dateReceived: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.inventorySection).toBe("Tablet Form");

    createdMedicineId = res.body.data._id;
    const initialMovement = await StockMovement.findOne({
      medicineId: createdMedicineId,
      type: "initial_stock",
    });
    expect(initialMovement?.quantityChange).toBe(5);
    const initialBatch = await InventoryBatch.findOne({ medicineId: createdMedicineId });
    expect(initialBatch?.batchNumber).toBe("TEST-INITIAL-BATCH");
    expect(String(initialMovement?.batchId)).toBe(String(initialBatch?._id));

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

  it("gives doctors only the read-only prescription medicine view", async () => {

    const res = await request(app)
      .get("/api/medicines/prescription-search")
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);

    const found = res.body.data.find(
      (m: any) => m._id === createdMedicineId
    );

    expect(found).toBeDefined();
    expect(found.isLowStock).toBe(true);
    expect(found.supplier).toBeUndefined();
    expect(found.expiryDate).toBeUndefined();

    const inventoryResponse = await request(app)
      .get("/api/medicines")
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(inventoryResponse.status).toBe(403);

  });


  it("includes the medicine in the dedicated low-stock endpoint", async () => {

    const res = await request(app)
      .get("/api/medicines/low-stock")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(200);

    const found = res.body.data.find(
      (m: any) => m._id === createdMedicineId
    );

    expect(found).toBeDefined();

  });


  it("clears the low-stock flag once restocked above the threshold", async () => {

    const updateRes = await request(app)
      .post(`/api/medicines/${createdMedicineId}/batches`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        batchNumber: `TEST-RESTOCK-${Date.now()}`,
        quantityReceived: 95,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });

    expect(updateRes.status).toBe(201);
    const adjustment = await StockMovement.findOne({
      medicineId: createdMedicineId,
      type: "received",
    }).sort({ occurredAt: -1 });
    expect(adjustment?.quantityChange).toBe(95);
    expect(adjustment?.balanceAfter).toBe(100);

    const listRes = await request(app)
      .get("/api/medicines")
      .set("Authorization", `Bearer ${nurseToken}`);

    const found = listRes.body.data.find(
      (m: any) => m._id === createdMedicineId
    );

    expect(found.isLowStock).toBe(false);

  });

});


describe("Medicine Inventory - Expiring/Expired", () => {

  let expiredId: string;
  let expiringSoonId: string;
  let farFutureId: string;

  beforeAll(async () => {

    const expired = await Medicine.create({
      name: "TEST Expired Medicine",
      quantity: 50,
      unit: "tablets",
      expiryDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
      lowStockThreshold: 10,
    });
    expiredId = String(expired._id);

    const expiringSoon = await Medicine.create({
      name: "TEST Expiring Soon Medicine",
      quantity: 50,
      unit: "tablets",
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
      lowStockThreshold: 10,
    });
    expiringSoonId = String(expiringSoon._id);

    const farFuture = await Medicine.create({
      name: "TEST Far Future Medicine",
      quantity: 50,
      unit: "tablets",
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      lowStockThreshold: 10,
    });
    farFutureId = String(farFuture._id);

  });

  afterAll(async () => {
    await Medicine.findByIdAndDelete(expiredId);
    await Medicine.findByIdAndDelete(expiringSoonId);
    await Medicine.findByIdAndDelete(farFutureId);
  });


  it("includes expired and expiring-soon medicines in /medicines/expiring", async () => {

    const res = await request(app)
      .get("/api/medicines/expiring")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(200);

    const ids = res.body.data.map((m: any) => m._id);

    expect(ids).toContain(expiredId);
    expect(ids).toContain(expiringSoonId);
    expect(ids).not.toContain(farFutureId);

  });


  it("flags isExpired and isExpiringSoon correctly on /medicines", async () => {

    const res = await request(app)
      .get("/api/medicines?limit=200")
      .set("Authorization", `Bearer ${nurseToken}`);

    const expired = res.body.data.find((m: any) => m._id === expiredId);
    const expiringSoon = res.body.data.find((m: any) => m._id === expiringSoonId);
    const farFuture = res.body.data.find((m: any) => m._id === farFutureId);

    expect(expired.isExpired).toBe(true);
    expect(expiringSoon.isExpiringSoon).toBe(true);
    expect(farFuture.isExpired).toBe(false);
    expect(farFuture.isExpiringSoon).toBe(false);

  });

});

describe("Medicine Inventory - Staff access", () => {
  it("blocks STAFF from viewing or editing inventory", async () => {
    const listResponse = await request(app)
      .get("/api/medicines")
      .set("Authorization", `Bearer ${staffToken}`);
    const updateResponse = await request(app)
      .put(`/api/medicines/${createdMedicineId}`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ quantity: 999 });

    expect(listResponse.status).toBe(403);
    expect(updateResponse.status).toBe(403);
  });
});

describe("Medicine Purchasing - New items", () => {
  it("allows a nurse to request a medicine not yet in inventory", async () => {
    const response = await request(app)
      .post("/api/purchase-requests")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        itemName: "TEST Cetirizine",
        unit: "tablets",
        category: "Antihistamine",
        inventorySection: "Tablet Form",
        quantityRequested: 100,
        reason: "Needed for allergy cases",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.requestType).toBe("new_item");
    expect(response.body.data.itemName).toBe("TEST Cetirizine");
    expect(response.body.data.inventorySection).toBe("Tablet Form");
    expect(response.body.data.medicineId).toBeUndefined();
    createdPurchaseRequestId = response.body.data._id;
  });
});
