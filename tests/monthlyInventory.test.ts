import request from "supertest";
import mongoose from "mongoose";
import app from "../src/app";
import Medicine from "../src/models/medicine.model";
import StockMovement from "../src/models/stockMovement.model";
import MonthlyInventoryReport from "../src/models/monthlyInventoryReport.model";
import AuditLog from "../src/models/auditLog.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

const YEAR = 2098;
const MONTH = 11;
let nurseToken: string;
let nurseId: string;
let doctorToken: string;
let doctorId: string;
let adminToken: string;
let adminId: string;
let staffToken: string;
let staffId: string;
let medicineId: string;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  await MonthlyInventoryReport.deleteMany({ year: YEAR, month: { $in: [MONTH, MONTH + 1] } });
  const nurse = await createTestUserAndLogin("nurse", "monthly_inventory_nurse");
  const doctor = await createTestUserAndLogin("doctor", "monthly_inventory_doctor");
  const admin = await createTestUserAndLogin("admin", "monthly_inventory_admin");
  const staff = await createTestUserAndLogin("staff", "monthly_inventory_staff");
  [nurseToken, nurseId] = [nurse.token, nurse.userId];
  [doctorToken, doctorId] = [doctor.token, doctor.userId];
  [adminToken, adminId] = [admin.token, admin.userId];
  [staffToken, staffId] = [staff.token, staff.userId];

  const medicine = await Medicine.create({
    name: `TEST Monthly Snapshot ${Date.now()}`,
    category: "Test",
    quantity: 12,
    unit: "tablets",
    lowStockThreshold: 5,
    lastUpdatedBy: nurseId,
  });
  medicineId = String(medicine._id);
  await StockMovement.create({
    medicineId,
    type: "received",
    quantityChange: 12,
    balanceAfter: 12,
    occurredAt: new Date(Date.UTC(YEAR, MONTH - 1, 5)),
    performedBy: nurseId,
  });
});

afterAll(async () => {
  const reports = await MonthlyInventoryReport.find({ year: YEAR, month: { $in: [MONTH, MONTH + 1] } }).select("_id");
  await AuditLog.deleteMany({ resource: "MonthlyInventoryReport", resourceId: { $in: reports.map((report) => String(report._id)) } });
  await MonthlyInventoryReport.deleteMany({ year: YEAR, month: { $in: [MONTH, MONTH + 1] } });
  await StockMovement.deleteMany({ medicineId });
  await Medicine.findByIdAndDelete(medicineId);
  await Promise.all([nurseId, doctorId, adminId, staffId].map(deleteTestUser));
  await mongoose.connection.close();
});

describe("Monthly inventory snapshots", () => {
  it("enforces draft permissions, calculates, reconciles, finalizes, and freezes history", async () => {
    for (const token of [doctorToken, adminToken, staffToken]) {
      const forbidden = await request(app)
        .post("/api/monthly-inventory/drafts")
        .set("Authorization", `Bearer ${token}`)
        .send({ year: YEAR, month: MONTH });
      expect(forbidden.status).toBe(403);
    }

    const opened = await request(app)
      .post("/api/monthly-inventory/drafts")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ year: YEAR, month: MONTH });
    expect(opened.status).toBe(201);
    const item = opened.body.data.items.find((entry: { medicineId: string }) => entry.medicineId === medicineId);
    expect(item.receivedQuantity).toBe(12);
    expect(item.calculatedEndingBalance).toBe(12);

    const doctorDraft = await request(app)
      .get(`/api/monthly-inventory/${opened.body.data._id}`)
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(doctorDraft.status).toBe(403);

    const reconciledItems = opened.body.data.items.map((entry: { medicineId: string; calculatedEndingBalance: number }) => ({
      medicineId: entry.medicineId,
      physicalCount: entry.calculatedEndingBalance,
    }));
    const saved = await request(app)
      .put(`/api/monthly-inventory/${opened.body.data._id}/draft`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ items: reconciledItems });
    expect(saved.status).toBe(200);

    const finalized = await request(app)
      .post(`/api/monthly-inventory/${opened.body.data._id}/finalize`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({});
    expect(finalized.status).toBe(200);
    expect(finalized.body.data.status).toBe("finalized");

    await Medicine.findByIdAndUpdate(medicineId, { quantity: 999 });
    const doctorView = await request(app)
      .get(`/api/monthly-inventory/${opened.body.data._id}`)
      .set("Authorization", `Bearer ${doctorToken}`);
    const frozen = doctorView.body.data.items.find((entry: { medicineId: string }) => entry.medicineId === medicineId);
    expect(doctorView.status).toBe(200);
    expect(frozen.calculatedEndingBalance).toBe(12);

    const exportResponse = await request(app)
      .get(`/api/monthly-inventory/${opened.body.data._id}/export`)
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toMatch(/text\/csv/);
    expect(exportResponse.text).toContain("Calculated Ending");
  });

  it("blocks transactions backdated into a finalized month", async () => {
    const response = await request(app)
      .post(`/api/medicines/${medicineId}/batches`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        batchNumber: `TEST-BACKDATE-${Date.now()}`,
        quantityReceived: 1,
        receivedAt: new Date(Date.UTC(YEAR, MONTH - 1, 20)).toISOString(),
        expiryDate: new Date(Date.UTC(YEAR + 1, MONTH - 1, 20)).toISOString(),
      });
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/finalized month/i);
  });
});
