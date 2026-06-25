import express, { Application, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db";
import userRoutes from "./routes/user.routes"; // Import routes
import patientRoutes from "./routes/patient.routes";
import authRoutes from "./routes/auth.routes";
import clinicVisitRoutes from "./routes/clinicVisit.routes";
import medicalHistoryRoutes from "./routes/medicalHistory.routes";
import appointmentRoutes from "./routes/appointment.routes";
import medicineRoutes from "./routes/medicine.routes";
import { generalLimiter } from "./middleware/rateLimit.middleware";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware";

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

const app: Application = express();

app.use(cors());
app.use(express.json());

// applies to every route below this line
app.use(generalLimiter);

app.use("/api/users", userRoutes);
// Register user routes

app.use("/api/patients", patientRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/visits",clinicVisitRoutes);

app.use("/api/medical-history", medicalHistoryRoutes);

app.use("/api/appointments", appointmentRoutes);

app.use("/api/medicines", medicineRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("School clinic API Running");
});

// These two MUST be last - order matters in Express.
// notFoundHandler catches any URL that didn't match a route above.
// errorHandler catches every error forwarded via next(error) anywhere in the app.
app.use(notFoundHandler);
app.use(errorHandler);

const PORT: number = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Server running on Port ${PORT}`);
});