import request from "supertest";
import mongoose from "mongoose";
import app from "../src/app";
import InAppNotification from "../src/models/inAppNotification.model";
import { createInAppNotification } from "../src/services/inAppNotification.service";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

let doctorToken: string;
let doctorId: string;
let nurseToken: string;
let nurseId: string;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const doctor = await createTestUserAndLogin("doctor", "notification_doctor");
  const nurse = await createTestUserAndLogin("nurse", "notification_nurse");
  doctorToken = doctor.token;
  doctorId = doctor.userId;
  nurseToken = nurse.token;
  nurseId = nurse.userId;
});

afterAll(async () => {
  await InAppNotification.deleteMany({ userId: { $in: [doctorId, nurseId] } });
  await deleteTestUser(doctorId);
  await deleteTestUser(nurseId);
  await mongoose.connection.close();
});

describe("In-app notifications", () => {
  it("returns only the authenticated user's notifications", async () => {
    await createInAppNotification({
      userId: doctorId,
      kind: "appointment_assigned",
      title: "New appointment assigned",
      message: "Test student appointment",
      link: "/dashboard?tab=appointments",
      resourceType: "Appointment",
      resourceId: new mongoose.Types.ObjectId().toString(),
      dedupeKey: `TEST:notification:${doctorId}`,
    });

    const doctorResponse = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(doctorResponse.status).toBe(200);
    expect(doctorResponse.body.data.items).toHaveLength(1);
    expect(doctorResponse.body.data.unreadCount).toBe(1);

    const nurseResponse = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${nurseToken}`);
    expect(nurseResponse.status).toBe(200);
    expect(nurseResponse.body.data.items).toHaveLength(0);
  });

  it("enforces ownership when marking a notification as read", async () => {
    const notification = await InAppNotification.findOne({ userId: doctorId });
    expect(notification).not.toBeNull();

    const denied = await request(app)
      .put(`/api/notifications/${notification!._id}/read`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({});
    expect(denied.status).toBe(404);

    const marked = await request(app)
      .put(`/api/notifications/${notification!._id}/read`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({});
    expect(marked.status).toBe(200);
    expect(marked.body.data.readAt).toBeTruthy();
  });

  it("marks all unread notifications for the authenticated user", async () => {
    await createInAppNotification({
      userId: doctorId,
      kind: "visit_ready",
      title: "Student ready",
      message: "Test student is ready",
      link: "/clinical-workspace",
      resourceType: "ClinicVisit",
      resourceId: new mongoose.Types.ObjectId().toString(),
      dedupeKey: `TEST:notification:ready:${doctorId}`,
    });

    const response = await request(app)
      .put("/api/notifications/read-all")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.data.updated).toBe(1);
    expect(await InAppNotification.countDocuments({ userId: doctorId, readAt: { $exists: false } })).toBe(0);
  });
});
