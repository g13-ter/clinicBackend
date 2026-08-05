import request from "supertest";
import app from "../src/app";
import User from "../src/models/user.model";
import bcrypt from "bcryptjs";


// Shared password for temporary test accounts.
export const TEST_PASSWORD = "testpass123";


// Create a test user directly and return a valid JWT.
export const createTestUserAndLogin = async (
  role: "admin" | "doctor" | "nurse" | "staff",
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

  await User.findByIdAndDelete(userId);

};
