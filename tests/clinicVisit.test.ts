import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";
import Patient from "../src/models/patient.model";
import ClinicVisit from "../src/models/clinicVisit.model";
import { createTestUserAndLogin, deleteTestUser } from "./helpers";

dotenv.config();

let adminToken: string;
let adminId: string;
let doctorToken: string;
let doctorId: string;
let nurseToken: string;
let nurseId: string;

let testPatientId: string;
let createdVisitId: string | null = null;


beforeAll(async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const admin = await createTestUserAndLogin("admin", "visits_admin");
  adminToken = admin.token;
  adminId = admin.userId;

  const doctor = await createTestUserAndLogin("doctor", "visits_doctor");
  doctorToken = doctor.token;
  doctorId = doctor.userId;

  const nurse = await createTestUserAndLogin("nurse", "visits_nurse");
  nurseToken = nurse.token;
  nurseId = nurse.userId;

  // create one real patient directly, to attach visits to
  const patient = await Patient.create({
    studentId: `TEST-VISIT-${Date.now()}`,
    firstName: "TEST",
    lastName: "VisitPatient",
    age: 19,
    gender: "Female",
    course: "BSN",
    yearLevel: 1,
    contactNumber: "09171234567",
    address: "Test Address",
  });

  testPatientId = (patient._id as any).toString();

});


afterAll(async () => {

  await deleteTestUser(adminId);
  await deleteTestUser(doctorId);
  await deleteTestUser(nurseId);

  await Patient.findByIdAndDelete(testPatientId);

  if (createdVisitId) {
    await ClinicVisit.findByIdAndDelete(createdVisitId);
  }

  await mongoose.connection.close();

});


describe("Clinic Visits - Create (clinical roles)", () => {

  it("allows a NURSE to log a visit with vitals", async () => {

    const res = await request(app)
      .post("/api/visits")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        patientId: testPatientId,
        complaint: "Headache and mild fever",
        treatment: "Paracetamol given",
        notes: "Advised to rest",
        bloodPressure: "120/80",
        temperature: 37.8,
        pulseRate: 88,
        heightCm: 170,
        weightKg: 65,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.bloodPressure).toBe("120/80");
    expect(res.body.data.temperature).toBe(37.8);
    expect(res.body.data.bmi).toBe(22.5);

    createdVisitId = res.body.data._id;

  });


  it("requires a NURSE or STAFF member to create the visit before doctor consultation", async () => {

    const res = await request(app)
      .post("/api/visits")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        patientId: testPatientId,
        complaint: "Doctor consultation"
      });

    expect(res.status).toBe(403);

  });


  it("rejects a visit with no complaint (validation)", async () => {

    const res = await request(app)
      .post("/api/visits")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        patientId: testPatientId
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");

  });

  it("rejects implausible vital signs with field-specific validation", async () => {
    const res = await request(app)
      .post("/api/visits")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        patientId: testPatientId,
        complaint: "Vital validation",
        bloodPressure: "129/23",
        temperature: 23,
        pulseRate: 4324,
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "bloodPressure" }),
        expect.objectContaining({ field: "temperature" }),
        expect.objectContaining({ field: "pulseRate" }),
      ]),
    );
  });

});


describe("Clinic Visits - View permissions", () => {

  it("returns the latest recorded height and weight for editable triage prefilling", async () => {
    const res = await request(app)
      .get(`/api/visits/patient/${testPatientId}/latest-vitals`)
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ heightCm: 170, weightKg: 65 });
    expect(res.body.data.heightRecordedAt).toEqual(expect.any(String));
    expect(res.body.data.weightRecordedAt).toEqual(expect.any(String));
  });

  it("keeps latest recorded height and weight unavailable to administrators", async () => {
    const res = await request(app)
      .get(`/api/visits/patient/${testPatientId}/latest-vitals`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it("does not expose an unassigned visit through doctor patient history", async () => {

    const res = await request(app)
      .get(`/api/visits/patient/${testPatientId}`)
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);

  });

  it("searches a student's visit records by clinical details", async () => {
    const matching = await request(app)
      .get(`/api/visits/patient/${testPatientId}?search=headache`)
      .set("Authorization", `Bearer ${nurseToken}`);
    const missing = await request(app)
      .get(`/api/visits/patient/${testPatientId}?search=not-in-any-test-visit`)
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(matching.status).toBe(200);
    expect(matching.body.data.some((visit: { _id: string }) => visit._id === createdVisitId)).toBe(true);
    expect(missing.status).toBe(200);
    expect(missing.body.data).toHaveLength(0);
  });

  it("shows a visit in the doctor queue only after the nurse marks it ready", async () => {
    const before = await request(app)
      .get("/api/visits/queue")
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(before.body.data.some((visit: { _id: string }) => visit._id === createdVisitId)).toBe(false);

    const ready = await request(app)
      .put(`/api/visits/${createdVisitId}/ready`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({});
    expect(ready.status).toBe(200);
    expect(ready.body.data.status).toBe("ready_for_doctor");

    const after = await request(app)
      .get("/api/visits/queue")
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(after.body.data.some((visit: { _id: string }) => visit._id === createdVisitId)).toBe(true);
  });


  it("blocks ADMIN from viewing clinic visits (medical data)", async () => {

    const res = await request(app)
      .get(`/api/visits/patient/${testPatientId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(403);

  });

});


describe("Clinic Visits - Archive (admin only)", () => {

  it("allows a doctor to record a referral with its required details", async () => {
    const res = await request(app)
      .put(`/api/visits/${createdVisitId}/status`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ status: "referred", referralFacility: "City Hospital", referralReason: "Further assessment" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("referred");
  });

  it("rejects a referral without facility and reason", async () => {
    const visit = await ClinicVisit.create({ patientId: testPatientId, complaint: "TEST referral validation", recordedBy: nurseId });
    const res = await request(app)
      .put(`/api/visits/${visit._id}/status`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ status: "referred" });
    expect(res.status).toBe(400);
    await ClinicVisit.findByIdAndDelete(visit._id);
  });

  it("blocks a NURSE from archiving a visit", async () => {

    const res = await request(app)
      .delete(`/api/visits/${createdVisitId}`)
      .set("Authorization", `Bearer ${nurseToken}`);

    expect(res.status).toBe(403);

  });


  it("allows ADMIN to archive a visit", async () => {

    const res = await request(app)
      .delete(`/api/visits/${createdVisitId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    // confirm it no longer shows up for the patient
    const listRes = await request(app)
      .get(`/api/visits/patient/${testPatientId}`)
      .set("Authorization", `Bearer ${nurseToken}`);

    const stillVisible = listRes.body.data.find(
      (v: any) => v._id === createdVisitId
    );

    expect(stillVisible).toBeUndefined();

  });

});

describe("Clinic Visits - Field-level clinical permissions", () => {
  it("allows a DOCTOR to start an emergency consultation without waiting for triage", async () => {
    const visit = await ClinicVisit.create({
      patientId: testPatientId,
      complaint: "TEST emergency consultation",
      recordedBy: nurseId,
      status: "triage",
      isEmergency: true,
      emergencyDetails: "Immediate breathing difficulty",
    });

    const res = await request(app)
      .put(`/api/visits/${visit._id}/status`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ status: "in_consultation" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("in_consultation");
    expect(String(res.body.data.assignedDoctorId)).toBe(doctorId);
    await ClinicVisit.findByIdAndDelete(visit._id);
  });

  it("still blocks a normal visit from starting before nurse triage is ready", async () => {
    const visit = await ClinicVisit.create({
      patientId: testPatientId,
      complaint: "TEST normal consultation",
      recordedBy: nurseId,
      status: "triage",
      isEmergency: false,
    });

    const res = await request(app)
      .put(`/api/visits/${visit._id}/status`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ status: "in_consultation" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/finish triage/i);
    await ClinicVisit.findByIdAndDelete(visit._id);
  });

  it("allows a NURSE to record and complete a nursing assessment", async () => {
    const visit = await ClinicVisit.create({
      patientId: testPatientId,
      complaint: "TEST nursing assessment",
      recordedBy: nurseId,
    });

    const assessment = await request(app)
      .put(`/api/visits/${visit._id}`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({
        nursingAssessment: "Mild headache after physical activity",
        nursingInterventions: "Rested and hydrated in the clinic",
      });
    expect(assessment.status).toBe(200);
    expect(assessment.body.data.nursingAssessment).toMatch(/mild headache/i);

    const completed = await request(app)
      .put(`/api/visits/${visit._id}/status`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ status: "completed", closureOutcome: "returned_to_class" });
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe("completed");
    expect(completed.body.data.closureOutcome).toBe("returned_to_class");

    await ClinicVisit.findByIdAndDelete(visit._id);
  });

  it("does not let a NURSE complete an active physician consultation as an assessment", async () => {
    const visit = await ClinicVisit.create({
      patientId: testPatientId,
      complaint: "TEST physician-claimed visit",
      recordedBy: nurseId,
      assignedDoctorId: doctorId,
      status: "in_consultation",
      readyForDoctor: true,
    });

    const res = await request(app)
      .put(`/api/visits/${visit._id}/status`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ status: "completed", closureOutcome: "returned_to_class" });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/claimed by a doctor/i);

    await ClinicVisit.findByIdAndDelete(visit._id);
  });

  it("blocks a DOCTOR from changing nurse-recorded vital signs", async () => {
    const assignedVisit = await ClinicVisit.create({
      patientId: testPatientId,
      complaint: "TEST assigned field permissions",
      recordedBy: nurseId,
      assignedDoctorId: doctorId,
    });
    const res = await request(app)
      .put(`/api/visits/${assignedVisit._id}`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ temperature: 38.2 });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only be recorded or updated by a nurse/i);
    await ClinicVisit.findByIdAndDelete(assignedVisit._id);
  });

  it("blocks a NURSE from recording physician consultation findings", async () => {
    const res = await request(app)
      .put(`/api/visits/${createdVisitId}`)
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ consultationFindings: "Physician diagnosis" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only be recorded by a doctor/i);
  });
});
