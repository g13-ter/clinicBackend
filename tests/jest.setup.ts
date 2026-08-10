import dotenv from "dotenv";
import { validateEnv } from "../src/utils/validateEnv";

dotenv.config();

const testUri = process.env.MONGO_TEST_URI?.trim();
if (!testUri) {
  throw new Error(
    "MONGO_TEST_URI is required. Tests are forbidden from using the application MONGO_URI.",
  );
}

const databaseName = testUri.split("?", 1)[0]?.replace(/\/$/, "").split("/").pop() ?? "";
if (!/(?:^|[_-])(test|tests|ci)(?:$|[_-])/i.test(databaseName)) {
  throw new Error(
    `Refusing to run tests against database "${databaseName || "<missing>"}". ` +
      "MONGO_TEST_URI must use a database name containing test, tests, or ci.",
  );
}

process.env.NODE_ENV = "test";
process.env.MONGO_URI = testUri;

// Validate shared test configuration only after the isolated URI is installed.
validateEnv();
