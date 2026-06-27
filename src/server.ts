import dotenv from "dotenv";
import connectDB from "./config/db";
import app from "./app";
import { validateEnv } from "./utils/validateEnv";
import logger from "./utils/logger";

dotenv.config();

// Fail loudly and immediately if critical env vars are missing,
// instead of crashing later with a confusing error.
validateEnv();

connectDB();

const PORT: number = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  logger.info(`Server running on Port ${PORT}`);
});