import dotenv from "dotenv";
import { validateEnv } from "../src/utils/validateEnv";

dotenv.config();

// Runs once before any test suite starts. Same idea as server.ts:
// fail fast with a clear message if MONGO_URI/JWT_SECRET are missing,
// instead of letting every individual test file hit a confusing
// Mongoose or JWT error on its own.
validateEnv();