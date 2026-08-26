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
import AuditLog from "../src/models/auditLog.model";
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
  await AuditLog.deleteMany({ resource: "StudentCompletionReview", resourceId: { $in: patientIds } });
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
      educationLevel: "college" as const,
      course: "BSIT",
      yearLevel: 2,
      programDurationYears: 4,
      contactNumber: "09171234567",
      address: "Test Address",
    };
    const patient = await Patient.create(student);
    patientIds.push(String(patient._id));

    const firstRollover = await request(app)
      .post("/api/patients/school-year/advance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ schoolYear: "2030-2031" });
    const secondRollover = await request(app)
      .post("/api/patients/school-year/advance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ schoolYear: "2030-2031" });

    expect(firstRollover.status).toBe(200);
    expect(secondRollover.status).toBe(200);
    expect((await Patient.findById(patient._id))?.yearLevel).toBe(3);
  });

  it("uses education-specific completion levels and college program length", async () => {
    const suffix = Date.now();
    const students = await Patient.create([
      { studentId: `TEST-ELEM-${suffix}`, firstName: "Elem", lastName: "Student", age: 12, gender: "Female", educationLevel: "elementary", yearLevel: 6, contactNumber: "09171234567", address: "Test Address" },
      { studentId: `TEST-JHS-${suffix}`, firstName: "Junior", lastName: "Student", age: 15, gender: "Male", educationLevel: "junior_high", yearLevel: 9, contactNumber: "09171234567", address: "Test Address" },
      { studentId: `TEST-JHS-FINAL-${suffix}`, firstName: "Junior Final", lastName: "Student", age: 16, gender: "Female", educationLevel: "junior_high", yearLevel: 10, contactNumber: "09171234567", address: "Test Address" },
      { studentId: `TEST-SHS-${suffix}`, firstName: "Senior", lastName: "Student", age: 18, gender: "Female", educationLevel: "senior_high", yearLevel: 12, contactNumber: "09171234567", address: "Test Address" },
      { studentId: `TEST-COLLEGE-${suffix}`, firstName: "College", lastName: "Student", age: 22, gender: "Male", educationLevel: "college", course: "BS Architecture", yearLevel: 4, programDurationYears: 5, contactNumber: "09171234567", address: "Test Address" },
      { studentId: `TEST-COLLEGE-FINAL-${suffix}`, firstName: "College Final", lastName: "Student", age: 23, gender: "Female", educationLevel: "college", course: "BS Architecture", yearLevel: 5, programDurationYears: 5, contactNumber: "09171234567", address: "Test Address" },
    ]);
    patientIds.push(...students.map((student) => String(student._id)));

    const response = await request(app)
      .post("/api/patients/school-year/advance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ schoolYear: "2031-2032" });

    expect(response.status).toBe(200);
    const elementary = await Patient.findById(students[0]!._id);
    const juniorHigh = await Patient.findById(students[1]!._id);
    const juniorHighFinal = await Patient.findById(students[2]!._id);
    const seniorHigh = await Patient.findById(students[3]!._id);
    const college = await Patient.findById(students[4]!._id);
    const collegeFinal = await Patient.findById(students[5]!._id);

    expect(elementary?.enrollmentStatus).toBe("completion_pending");
    expect(elementary?.isActive).toBe(true);
    expect(juniorHigh?.yearLevel).toBe(10);
    expect(juniorHigh?.enrollmentStatus).toBe("active");
    expect(juniorHighFinal?.enrollmentStatus).toBe("completion_pending");
    expect(juniorHighFinal?.isActive).toBe(true);
    expect(seniorHigh?.enrollmentStatus).toBe("completion_pending");
    expect(seniorHigh?.isActive).toBe(true);
    expect(college?.yearLevel).toBe(5);
    expect(college?.enrollmentStatus).toBe("active");
    expect(collegeFinal?.enrollmentStatus).toBe("completion_pending");
    expect(collegeFinal?.isActive).toBe(true);
  });

  it.each([
    ["graduated", "graduated", false],
    ["retained", "active", true],
    ["extended", "extended", true],
    ["transferred", "transferred", false],
  ] as const)(
    "lets an admin resolve a completion candidate as %s",
    async (decision, expectedStatus, expectedActive) => {
      const suffix = `${decision}-${Date.now()}`;
      const candidate = await Patient.create({
        studentId: `TEST-REVIEW-${suffix}`,
        firstName: "Review",
        lastName: "Candidate",
        age: 18,
        gender: "Female",
        educationLevel: "senior_high",
        yearLevel: 12,
        enrollmentStatus: "completion_pending",
        contactNumber: "09171234567",
        address: "Test Address",
      });
      patientIds.push(String(candidate._id));

      const response = await request(app)
        .put(`/api/patients/${candidate._id}/completion-review`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ decision, notes: `Confirmed ${decision}` });

      expect(response.status).toBe(200);
      const reviewed = await Patient.findById(candidate._id);
      expect(reviewed?.enrollmentStatus).toBe(expectedStatus);
      expect(reviewed?.isActive).toBe(expectedActive);
      expect(reviewed?.completionReviewDecision).toBe(decision);
      expect(reviewed?.completionReviewNotes).toBe(`Confirmed ${decision}`);
      expect(String(reviewed?.completionReviewedBy)).toBe(adminId);
      expect(reviewed?.completionReviewedAt).toBeInstanceOf(Date);
      const auditEntry = await AuditLog.findOne({
        resource: "StudentCompletionReview",
        resourceId: String(candidate._id),
        performedBy: adminId,
      });
      expect(auditEntry).not.toBeNull();
      expect(auditEntry?.changes?.after).toMatchObject({
        completionReviewDecision: decision,
        completionReviewNotes: `Confirmed ${decision}`,
        enrollmentStatus: expectedStatus,
        isActive: expectedActive,
      });
      expect(auditEntry?.changes?.after).not.toHaveProperty("medicalAlerts");
    },
  );

  it("keeps completion decisions Admin-only", async () => {
    const candidate = await Patient.create({
      studentId: `TEST-REVIEW-RBAC-${Date.now()}`,
      firstName: "Restricted",
      lastName: "Candidate",
      age: 18,
      gender: "Male",
      educationLevel: "senior_high",
      yearLevel: 12,
      enrollmentStatus: "completion_pending",
      contactNumber: "09171234567",
      address: "Test Address",
    });
    patientIds.push(String(candidate._id));

    const response = await request(app)
      .put(`/api/patients/${candidate._id}/completion-review`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ decision: "graduated" });

    expect(response.status).toBe(403);
    expect((await Patient.findById(candidate._id))?.enrollmentStatus).toBe("completion_pending");
  });

  it("does not let a nurse change an enrollment outcome through the general patient update", async () => {
    const candidate = await Patient.create({
      studentId: `TEST-REVIEW-UPDATE-${Date.now()}`,
      firstName: "Protected",
      lastName: "Candidate",
      age: 18,
      gender: "Female",
      educationLevel: "senior_high",
      yearLevel: 12,
      enrollmentStatus: "completion_pending",
      contactNumber: "09171234567",
      address: "Test Address",
    });
    patientIds.push(String(candidate._id));

    const response = await request(app)
      .put(`/api/patients/${candidate._id}`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ enrollmentStatus: "graduated", schoolYear: "2032-2033" });

    expect(response.status).toBe(200);
    const unchanged = await Patient.findById(candidate._id);
    expect(unchanged?.enrollmentStatus).toBe("completion_pending");
    expect(unchanged?.schoolYear).toBeUndefined();
  });
});

describe("Purchase request lifecycle", () => {
  it("allows only one concurrent review decision", async () => {
    const created = await request(app).post("/api/purchase-requests").set("Authorization", `Bearer ${nurseToken}`).send({ itemName: `TEST Concurrent ${Date.now()}`, unit: "boxes", quantityRequested: 3, reason: "Concurrency regression test" });
    const requestId = created.body.data._id as string;
    requestIds.push(requestId);
    const [approved, rejected] = await Promise.all([
      request(app).put(`/api/purchase-requests/${requestId}/review`).set("Authorization", `Bearer ${adminToken}`).send({ status: "approved" }),
      request(app).put(`/api/purchase-requests/${requestId}/review`).set("Authorization", `Bearer ${adminToken}`).send({ status: "rejected" }),
    ]);
    expect([approved.status, rejected.status].sort()).toEqual([200, 409]);
  });
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
    if (!updatedRequest) throw new Error("Expected the received purchase request to exist");
    const medicine = await Medicine.findById(updatedRequest.medicineId);
    if (!medicine) throw new Error("Expected the received medicine to exist");
    const batch = await InventoryBatch.findOne({ medicineId: medicine._id });
    expect(medicine.quantity).toBe(40);
    expect(batch?.quantityRemaining).toBe(40);
    const receiptMovement = await StockMovement.findOne({
      medicineId: medicine._id,
      type: "received",
    });
    expect(receiptMovement?.quantityChange).toBe(40);
    expect(receiptMovement?.balanceAfter).toBe(40);
    medicineIds.push(String(medicine._id));
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
