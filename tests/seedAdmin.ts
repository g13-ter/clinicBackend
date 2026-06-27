// One-time script to create the very first admin account.
// Run this once with: npx ts-node tests/seedAdmin.ts
// (Not part of the test suite - just a setup helper.)

import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "../src/models/user.model";

dotenv.config();

const seedAdmin = async () => {

  await mongoose.connect(process.env.MONGO_URI as string);

  const existing = await User.findOne({ email: "admin@clinic.com" });

  if (existing) {
    console.log("Admin already exists, nothing to do.");
    await mongoose.connection.close();
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("admin123", salt);

  await User.create({
    name: "Admin User",
    email: "admin@clinic.com",
    password: hashedPassword,
    role: "admin"
  });

  console.log("Admin created: admin@clinic.com / admin123");

  await mongoose.connection.close();

};

seedAdmin();