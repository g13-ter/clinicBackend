import request from "supertest";
import app from "../src/app";
import User from "../src/models/user.model";
import bcrypt from "bcryptjs";
import type { UserRole } from "../src/types/roles";
import { CURRENT_TERMS_VERSION } from "../src/config/terms";
import InAppNotification from "../src/models/inAppNotification.model";


// Shared password for temporary test accounts.
export const TEST_PASSWORD = "testpass1234";


// Create a test user directly and return a valid JWT.
export const createTestUserAndLogin = async (
  role: UserRole,
  emailPrefix: string
): Promise<{ token: string; userId: string; email: string }> => {

  const email = `TEST_${emailPrefix}_${Date.now()}@clinic.com`;

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, salt);

  const user = await User.create({
    name: `TEST ${role}`,
    email,
    password: hashedPassword,
    role,
    termsAccepted: true,
    termsVersionAccepted: CURRENT_TERMS_VERSION,
  });

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({
      email,
      password: TEST_PASSWORD
    });

  return {
    token: loginRes.body.token,
    userId: (user._id as any).toString(),
    email
  };

};


// Delete a test user during cleanup.
export const deleteTestUser = async (userId: string) => {

  await Promise.all([
    User.findByIdAndDelete(userId),
    InAppNotification.deleteMany({ userId }),
  ]);

};
