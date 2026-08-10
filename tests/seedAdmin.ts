// One-time admin setup helper. Configure credentials outside local development.

import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "../src/models/user.model";

dotenv.config();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@clinic.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin123";
const ADMIN_ROLE = process.env.SEED_ADMIN_ROLE === "superadmin" ? "superadmin" : "admin";

const seedAdmin = async () => {

  if (process.env.NODE_ENV === "production" && !process.env.SEED_ADMIN_PASSWORD) {
    console.error("ERROR: Set SEED_ADMIN_PASSWORD env var before seeding in production.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI as string);

  const existing = await User.findOne({ email: ADMIN_EMAIL });

  if (existing) {
    console.log("Administrative account already exists, nothing to do.");
    await mongoose.connection.close();
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

  await User.create({
    name: ADMIN_ROLE === "superadmin" ? "Super Admin User" : "Admin User",
    email: ADMIN_EMAIL,
    password: hashedPassword,
    role: ADMIN_ROLE,
  });

  console.log(`${ADMIN_ROLE === "superadmin" ? "Super Admin" : "Admin"} created: ${ADMIN_EMAIL}`);

  await mongoose.connection.close();

};

seedAdmin();
