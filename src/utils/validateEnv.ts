import logger from "./logger";

// Centralized startup check for required environment variables.
// Runs once, before anything else (DB connection, server listen).
// If something critical is missing, we want a clear error message
// pointing at exactly what's missing - not a cryptic crash later
// from Mongoose or jsonwebtoken with an "undefined" value.

const REQUIRED_ENV_VARS = ["MONGO_URI", "JWT_SECRET"];

export const validateEnv = (): void => {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error(
      `FATAL ERROR: Missing required environment variable(s): ${missing.join(", ")}.\n` +
        "Check your .env file. Server will not start."
    );
    process.exit(1);
  }
};