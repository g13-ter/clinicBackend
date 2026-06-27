// One-time script to create the very first admin account.
// Run this once with: npx ts-node tests/seedAdmin.ts
//
// By default, creates admin@clinic.com / admin123 for local dev.
// Before running this against a real/production database, set
// SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD as env vars instead -
// a hardcoded admin password is fine for local testing, but should
// never be the real login for a deployed system.
//
// (Not part of the test suite - just a setup helper.)

import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "../src/models/user.model";

dotenv.config();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@clinic.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin123";

const seedAdmin = async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const existing = await User.findOne({ email: ADMIN_EMAIL });

  if (existing) {
    console.log("Admin already exists, nothing to do.");
    await mongoose.connection.close();
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

  await User.create({
    name: "Admin User",
    email: ADMIN_EMAIL,
    password: hashedPassword,
    role: "admin"
  });

  console.log(`Admin created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  await mongoose.connection.close();

};

seedAdmin();