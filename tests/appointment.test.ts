import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import Appointment from "../src/models/appointment.model";
import ClinicVisit from "../src/models/clinicVisit.model";
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
const appointmentIds: string[] = [];


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
  await Appointment.deleteMany({ _id: { $in: appointmentIds } });
  await ClinicVisit.deleteMany({ appointmentId: { $in: appointmentIds } });

  await mongoose.connection.close();

});


describe("Appointments - Create (staff, nurse, and doctor)", () => {

  it("allows STAFF to book an appointment, defaulting to pending status", async () => {

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        patientId: testPatientId,
        doctorId,
        appointmentDate: "2026-07-01T09:00:00.000Z",
        reason: "Follow-up checkup",
        notes: "Requested by parent"
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");

    createdAppointmentId = res.body.data._id;

  });


  it("allows a NURSE to book an appointment", async () => {

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        patientId: testPatientId,
        doctorId,
        appointmentDate: "2026-07-02T09:00:00.000Z",
        reason: "Post-visit follow-up"
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");

  });


  it("rejects an appointment with an invalid date", async () => {

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        patientId: testPatientId,
        doctorId,
        appointmentDate: "not-a-real-date",
        reason: "Bad date test"
      });

    expect(res.status).toBe(400);

  });

});


describe("Appointments - Shared view access", () => {

  it("rejects overlapping appointments for the same doctor", async () => {
    const first = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ patientId: testPatientId, doctorId, appointmentDate: "2026-08-15T09:00:00.000Z", durationMinutes: 60, reason: "First slot" });
    expect(first.status).toBe(201);
    appointmentIds.push(first.body.data._id);

    const overlap = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ patientId: testPatientId, doctorId, appointmentDate: "2026-08-15T09:30:00.000Z", durationMinutes: 30, reason: "Overlapping slot" });
    expect(overlap.status).toBe(409);
  });

  it("allows a DOCTOR to schedule their own follow-up", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        patientId: testPatientId,
        appointmentDate: "2026-07-03T09:00:00.000Z",
        reason: "Clinical follow-up",
        type: "follow_up",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.doctorId).toBe(doctorId);
    expect(res.body.data.type).toBe("follow_up");
    appointmentIds.push(res.body.data._id);
  });

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


describe("Appointments - Status updates (staff and nurse, no real delete)", () => {

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
      .send({
        status: "cancelled",
        cancellationReason: "Student is unavailable at the scheduled time",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("cancelled");

  });


  it("allows a NURSE to reschedule an appointment", async () => {

    const res = await request(app)
      .put(`/api/appointments/${createdAppointmentId}`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ appointmentDate: "2026-07-10T14:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("pending");
    expect(new Date(res.body.data.appointmentDate).toISOString()).toBe("2026-07-10T14:00:00.000Z");

  });

});

describe("Appointments - Check-in flow", () => {
  it("creates one linked queue visit and safely reuses it", async () => {
    const appointment = await Appointment.create({
      patientId: testPatientId,
      doctorId,
      appointmentDate: new Date(),
      reason: "TEST linked check-in",
      status: "confirmed",
      createdBy: staffId,
    });
    appointmentIds.push(String(appointment._id));

    const first = await request(app)
      .post(`/api/appointments/${appointment._id}/check-in`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({});

    expect(first.status).toBe(201);
    expect(first.body.data.appointment.status).toBe("checked_in");
    expect(first.body.data.visit.appointmentId).toBe(String(appointment._id));
    expect(first.body.data.visit.status).toBe("triage");

    const second = await request(app)
      .post(`/api/appointments/${appointment._id}/check-in`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({});

    expect(second.status).toBe(200);
    expect(second.body.data.visit._id).toBe(first.body.data.visit._id);
    expect(await ClinicVisit.countDocuments({ appointmentId: appointment._id })).toBe(1);
  });

  it("does not check in cancelled appointments", async () => {
    const appointment = await Appointment.create({
      patientId: testPatientId,
      appointmentDate: new Date(),
      reason: "TEST cancelled check-in",
      status: "cancelled",
      createdBy: staffId,
    });
    appointmentIds.push(String(appointment._id));

    const response = await request(app)
      .post(`/api/appointments/${appointment._id}/check-in`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({});

    expect(response.status).toBe(409);
  });

  it("allows a doctor to start an assigned appointment", async () => {
    const appointment = await Appointment.create({
      patientId: testPatientId,
      doctorId,
      appointmentDate: new Date(),
      reason: "TEST doctor consultation start",
      status: "confirmed",
      createdBy: staffId,
    });
    appointmentIds.push(String(appointment._id));

    const response = await request(app)
      .post(`/api/appointments/${appointment._id}/check-in`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({});

    expect(response.status).toBe(201);
    expect(response.body.data.appointment.status).toBe("checked_in");
    expect(response.body.data.visit.assignedDoctorId).toBe(doctorId);
  });
});
