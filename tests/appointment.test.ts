import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import Appointment from "../src/models/appointment.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let staffToken: string;
let staffId: string;
let nurseToken: string;
let nurseId: string;
let doctorToken: string;
let doctorId: string;

let testPatientId: string;
let createdAppointmentId: string | null = null;


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const staff = await createTestUserAndLogin("staff", "appt_staff");
  staffToken = staff.token;
  staffId = staff.userId;

  const nurse = await createTestUserAndLogin("nurse", "appt_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

  const doctor = await createTestUserAndLogin("doctor", "appt_doctor");
  doctorToken = doctor.token;
  doctorId = doctor.userId;

  const patient = await Patient.create({
    studentId: `TEST-APPT-${Date.now()}`,
    firstName: "TEST",
    lastName: "ApptPatient",
    age: 20,
    gender: "Female",
    course: "BSED",
    yearLevel: 2,
    contactNumber: "09171234567",
    address: "Test Address"
  });

  testPatientId = (patient._id as any).toString();

});


afterAll(async () => {

  await deleteTestUser(staffId);
  await deleteTestUser(nurseId);
  await deleteTestUser(doctorId);

  await Patient.findByIdAndDelete(testPatientId);

  if (createdAppointmentId) {
    await Appointment.findByIdAndDelete(createdAppointmentId);
  }

  await mongoose.connection.close();

});


describe("Appointments - Create (staff only)", () => {

  it("allows STAFF to book an appointment, defaulting to pending status", async () => {

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        patientId: testPatientId,
        appointmentDate: "2026-07-01T09:00:00.000Z",
        reason: "Follow-up checkup",
        notes: "Requested by parent"
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");

    createdAppointmentId = res.body.data._id;

  });


  it("blocks a NURSE from booking an appointment", async () => {

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        patientId: testPatientId,
        appointmentDate: "2026-07-02T09:00:00.000Z",
        reason: "Should not be allowed"
      });

    expect(res.status).toBe(403);

  });


  it("rejects an appointment with an invalid date", async () => {

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        patientId: testPatientId,
        appointmentDate: "not-a-real-date",
        reason: "Bad date test"
      });

    expect(res.status).toBe(400);

  });

});


describe("Appointments - Shared view access", () => {

  it("DOCTOR can view the appointment list", async () => {

    const res = await request(app)
      .get("/api/appointments")
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

  });


  it("NURSE can view the appointment list", async () => {

    const res = await request(app)
      .get("/api/appointments")
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(200);

  });

});


describe("Appointments - Status updates (staff only, no real delete)", () => {

  it("blocks a DOCTOR from updating appointment status", async () => {

    const res = await request(app)
      .put(`/api/appointments/${createdAppointmentId}`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ status: "confirmed" });

    expect(res.status).toBe(403);

  });


  it("allows STAFF to cancel an appointment by changing its status", async () => {

    const res = await request(app)
      .put(`/api/appointments/${createdAppointmentId}`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("cancelled");

  });

});