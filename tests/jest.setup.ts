import dotenv from "dotenv";
import { validateEnv } from "../src/utils/validateEnv";

dotenv.config();

// Validate shared test configuration before suites run.
validateEnv();
