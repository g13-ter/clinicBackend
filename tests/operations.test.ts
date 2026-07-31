import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import Medicine from "../src/models/medicine.model";
import InventoryBatch from "../src/models/inventoryBatch.model";
import PurchaseRequest from "../src/models/purchaseRequest.model";
import NotificationOutbox from "../src/models/notificationOutbox.model";
import StockMovement from "../src/models/stockMovement.model";
import {
  enqueueNotification,
  processNotificationOutbox,
} from "../src/services/notificationOutbox.service";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let adminToken: string;
let adminId: string;
let nurseToken: string;
let nurseId: string;
const patientIds: string[] = [];
const requestIds: string[] = [];
const medicineIds: string[] = [];
const batchIds: string[] = [];
const outboxIds: string[] = [];

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const admin = await createTestUserAndLogin("admin", "operations_admin");
  adminToken = admin.token;
  adminId = admin.userId;
  const nurse = await createTestUserAndLogin("nurse", "operations_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;
});

afterAll(async () => {
  await Patient.deleteMany({ _id: { $in: patientIds } });
  await StockMovement.deleteMany({ medicineId: { $in: medicineIds } });
  await InventoryBatch.deleteMany({ _id: { $in: batchIds } });
  await Medicine.deleteMany({ _id: { $in: medicineIds } });
  await PurchaseRequest.deleteMany({ _id: { $in: requestIds } });
  await NotificationOutbox.deleteMany({ _id: { $in: outboxIds } });
  await deleteTestUser(adminId);
  await deleteTestUser(nurseId);
  await mongoose.connection.close();
});

describe("School-year rollover", () => {
  it("rolls over each active student only once per target year", async () => {
    const studentId = `TEST-IMPORT-${Date.now()}`;
    const student = {
      studentId,
      firstName: "Import",
      lastName: "Student",
      age: 19,
      gender: "Female",
      course: "BSIT",
      yearLevel: 2,
      contactNumber: "09171234567",
      address: "Test Address",
    };
    const patient = await Patient.create(student);
    patientIds.push(String(patient._id));

    const firstRollover = await request(app)
      .post("/api/patients/school-year/advance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ schoolYear: "2030-2031", graduatingYearLevel: 4 });
    const secondRollover = await request(app)
      .post("/api/patients/school-year/advance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ schoolYear: "2030-2031", graduatingYearLevel: 4 });

    expect(firstRollover.status).toBe(200);
    expect(secondRollover.status).toBe(200);
    expect((await Patient.findById(patient._id))?.yearLevel).toBe(3);
  });
});

describe("Purchase request lifecycle", () => {
  it("approves, orders, and receives a new medicine into a batch", async () => {
    const createResponse = await request(app)
      .post("/api/purchase-requests")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        itemName: `TEST New Medicine ${Date.now()}`,
        unit: "tablets",
        category: "Test",
        quantityRequested: 40,
        reason: "Lifecycle regression test",
      });
    expect(createResponse.status).toBe(201);
    const requestId = createResponse.body.data._id as string;
    requestIds.push(requestId);

    expect((await request(app)
      .put(`/api/purchase-requests/${requestId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "approved" })).status).toBe(200);
    expect((await request(app)
      .put(`/api/purchase-requests/${requestId}/order`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplier: "Test Supplier", estimatedCost: 1200 })).status).toBe(200);

    const receiveResponse = await request(app)
      .put(`/api/purchase-requests/${requestId}/receive`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        batchNumber: `TEST-BATCH-${Date.now()}`,
        quantityReceived: 40,
        expiryDate: "2031-12-31",
        supplier: "Test Supplier",
      });
    expect(receiveResponse.status).toBe(200);
    expect(receiveResponse.body.data.status).toBe("received");

    const updatedRequest = await PurchaseRequest.findById(requestId);
    const medicine = await Medicine.findById(updatedRequest?.medicineId);
    const batch = await InventoryBatch.findOne({ medicineId: medicine?._id });
    expect(medicine?.quantity).toBe(40);
    expect(batch?.quantityRemaining).toBe(40);
    const receiptMovement = await StockMovement.findOne({
      medicineId: medicine?._id,
      type: "received",
    });
    expect(receiptMovement?.quantityChange).toBe(40);
    expect(receiptMovement?.balanceAfter).toBe(40);
    medicineIds.push(String(medicine?._id));
    batchIds.push(String(batch?._id));
  });

  it("allows an admin to cancel an order before delivery", async () => {
    const createResponse = await request(app)
      .post("/api/purchase-requests")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        itemName: `TEST Cancel Medicine ${Date.now()}`,
        unit: "bottles",
        quantityRequested: 2,
        reason: "Cancellation regression test",
      });
    const requestId = createResponse.body.data._id as string;
    requestIds.push(requestId);
    await request(app)
      .put(`/api/purchase-requests/${requestId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "approved" });

    const cancelResponse = await request(app)
      .put(`/api/purchase-requests/${requestId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reviewNotes: "No longer required" });

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.data.status).toBe("cancelled");
  });
});

describe("Notification delivery queue", () => {
  it("deduplicates and records successful delivery", async () => {
    const dedupeKey = `test-notification-${Date.now()}`;
    const input = {
      kind: "low_stock" as const,
      recipient: "test-delivery@example.com",
      dedupeKey,
      payload: {
        itemName: "Test Medicine",
        quantity: 1,
        unit: "tablet",
        status: "Low stock",
      },
    };
    await enqueueNotification(input);
    await enqueueNotification(input);
    const queued = await NotificationOutbox.find({ dedupeKey });
    outboxIds.push(...queued.map((item) => String(item._id)));
    expect(queued).toHaveLength(1);

    const result = await processNotificationOutbox(100);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);
    expect((await NotificationOutbox.findOne({ dedupeKey }))?.status).toBe("sent");
  });
});
