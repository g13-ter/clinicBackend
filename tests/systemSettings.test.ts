import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import SystemSettings from "../src/models/systemSettings.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let adminToken: string;
let adminId: string;
let staffToken: string;
let staffId: string;
let nurseToken: string;
let nurseId: string;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const admin = await createTestUserAndLogin("admin", "settings_admin");
  const staff = await createTestUserAndLogin("staff", "settings_staff");
  const nurse = await createTestUserAndLogin("nurse", "settings_nurse");
  adminToken = admin.token;
  adminId = admin.userId;
  staffToken = staff.token;
  staffId = staff.userId;
  nurseToken = nurse.token;
  nurseId = nurse.userId;
  await SystemSettings.deleteOne({ key: "clinic" });
});

afterAll(async () => {
  await SystemSettings.deleteOne({ key: "clinic" });
  await deleteTestUser(adminId);
  await deleteTestUser(staffId);
  await deleteTestUser(nurseId);
  await mongoose.connection.close();
});

describe("System settings", () => {
  it("allows an admin to save and retrieve clinic settings", async () => {
    const payload = {
      schoolYear: "2026-2027",
      clinicOpenTime: "07:30",
      clinicCloseTime: "17:30",
      emailNotificationsEnabled: true,
      appointmentRemindersEnabled: false,
      stockAlertsEnabled: true,
    };

    const update = await request(app)
      .put("/api/system-settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(payload);

    expect(update.status).toBe(200);
    expect(update.body.data.schoolYear).toBe(payload.schoolYear);

    const get = await request(app)
      .get("/api/system-settings")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(get.status).toBe(200);
    expect(get.body.data.clinicOpenTime).toBe(payload.clinicOpenTime);
    expect(get.body.data.appointmentRemindersEnabled).toBe(false);
  });

  it("blocks staff from reading system settings", async () => {
    const res = await request(app)
      .get("/api/system-settings")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });

  it("exposes the clinic profile publicly and lets a nurse update only that profile", async () => {
    const payload = {
      clinicName: "Campus Wellness Clinic",
      buildingLocation: "Main Building",
      floorRoom: "Ground Floor, Room 102",
      operatingDays: "Monday–Saturday",
      clinicOpenTime: "08:00",
      clinicCloseTime: "18:00",
      phoneNumber: "0912 000 0000",
      emailAddress: "wellness@yourschool.edu.ph",
    };
    const update = await request(app)
      .put("/api/system-settings/clinic-profile")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send(payload);
    expect(update.status).toBe(200);
    expect(update.body.data.floorRoom).toBe("Ground Floor, Room 102");

    const publicProfile = await request(app).get("/api/system-settings/clinic-profile");
    expect(publicProfile.status).toBe(200);
    expect(publicProfile.body.data).toMatchObject(payload);

    const prohibited = await request(app)
      .put("/api/system-settings/clinic-profile")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ ...payload, schoolYear: "2030-2031" });
    expect(prohibited.status).toBe(400);
  });

  it("rejects invalid operating hours", async () => {
    const res = await request(app)
      .put("/api/system-settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        schoolYear: "2026-2027",
        clinicOpenTime: "17:00",
        clinicCloseTime: "08:00",
        emailNotificationsEnabled: true,
        appointmentRemindersEnabled: true,
        stockAlertsEnabled: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe("clinicCloseTime");
  });
});
