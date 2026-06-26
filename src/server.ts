import dotenv from "dotenv";
import connectDB from "./config/db";
import app from "./app";

dotenv.config();

// Fail loudly and immediately if critical secrets are missing,
// instead of silently falling back to a guessable default.
if (!process.env.JWT_SECRET) {
  console.error(
    "FATAL ERROR: JWT_SECRET is not set in .env. Server will not start."
  );
  process.exit(1);
}

connectDB();

const PORT: number = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Server running on Port ${PORT}`);
});