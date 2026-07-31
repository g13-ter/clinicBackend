// Isolate the Patient isActive default from the application stack.
// Run with: npm run debug-default

import mongoose from "mongoose";
import dotenv from "dotenv";
import Patient from "../src/models/patient.model";

dotenv.config();

const run = async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  console.log("Mongoose version:", mongoose.version);

  const patient = new Patient({
    studentId: `ISOLATED-${Date.now()}`,
    firstName: "Isolated",
    lastName: "Test",
    age: 20,
    gender: "Male",
    course: "BSIT",
    yearLevel: 2,
    contactNumber: "09171234567",
    address: "Test Address"
  });

  console.log("Before save, isActive:", patient.isActive);

  await patient.save();

  console.log("After save, isActive:", patient.isActive);

  const fetched = await Patient.findById(patient._id);

  console.log("Freshly fetched from DB, isActive:", fetched?.isActive);

  // clean up
  await Patient.findByIdAndDelete(patient._id);

  await mongoose.connection.close();

};

run();
