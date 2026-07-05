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
};
