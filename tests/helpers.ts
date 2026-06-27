import request from "supertest";
import app from "../src/app";
import User from "../src/models/user.model";
import bcrypt from "bcryptjs";


// A consistent password used for every test account we create -
// these are throwaway accounts that only exist during test runs.
export const TEST_PASSWORD = "testpass123";


// Creates one test user with a given role, directly in the database
// (bypassing the API, since the API itself is what we're testing).
// Returns the user's real JWT token, ready to use in requests.
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
    role
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


// Deletes a test user directly - used in afterAll cleanup
export const deleteTestUser = async (userId: string) => {

  await User.findByIdAndDelete(userId);

};