import logger from "./logger";

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

  if ((process.env.JWT_SECRET as string).length < 32) {
    logger.error("FATAL ERROR: JWT_SECRET must be at least 32 characters. Use: npm run generate-secret");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && (process.env.MONGO_URI as string).includes("localhost")) {
    logger.error("FATAL ERROR: MONGO_URI points to localhost in a production environment.");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && !process.env.CLIENT_ORIGIN) {
    logger.error("FATAL ERROR: CLIENT_ORIGIN must be set in production (your frontend URL).");
    process.exit(1);
  }

  if (
    process.env.MONGO_TRANSACTIONS_ENABLED &&
    !["true", "false"].includes(process.env.MONGO_TRANSACTIONS_ENABLED)
  ) {
    logger.error("FATAL ERROR: MONGO_TRANSACTIONS_ENABLED must be either true or false.");
    process.exit(1);
  }

  if (
    process.env.RUN_BACKGROUND_JOBS_IN_API &&
    !["true", "false"].includes(process.env.RUN_BACKGROUND_JOBS_IN_API)
  ) {
    logger.error("FATAL ERROR: RUN_BACKGROUND_JOBS_IN_API must be either true or false.");
    process.exit(1);
  }

  // Warn when optional production integrations are disabled.
  if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
    logger.warn(
      "RESEND_API_KEY is not set — appointment confirmation/reminder and inventory " +
        "notification emails will be skipped (logged only, not sent)."
    );
  }

  if (process.env.NODE_ENV === "production" && !process.env.INTERNAL_API_KEY) {
    logger.warn(
      "INTERNAL_API_KEY is not set — POST /api/internal/send-reminders is disabled. " +
        "The in-process hourly reminder sweep still runs regardless."
    );
  }
};
