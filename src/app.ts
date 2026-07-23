import "./types/express";
import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger";
import userRoutes from "./routes/user.routes";
import patientRoutes from "./routes/patient.routes";
import authRoutes from "./routes/auth.routes";
import clinicVisitRoutes from "./routes/clinicVisit.routes";
import medicalHistoryRoutes from "./routes/medicalHistory.routes";
import appointmentRoutes from "./routes/appointment.routes";
import medicineRoutes from "./routes/medicine.routes";
import healthRoutes from "./routes/health.routes";
import { generalLimiter } from "./middleware/rateLimit.middleware";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware";
import auditLogRoutes from "./routes/auditLog.routes";
import reportRoutes from "./routes/report.routes";
import analyticsRoutes from "./routes/analytics.routes";

// This file ONLY builds the Express app - it does NOT start a
// real network server (no app.listen here). That's what makes it
// safe for tests to import: Supertest can simulate requests against
// this app directly, in-memory, without opening a real port.
//
// server.ts (the real entry point) imports this app and is the
// ONLY place that actually calls app.listen().

const app: Application = express();

// Required when running behind nginx/reverse proxy so rate limiting
// and logs see the real client IP from X-Forwarded-For.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());

// Public health check — no auth, no rate limit (used by load balancers / CI).
app.use("/api/health", healthRoutes);

// applies to every route below this line
app.use(generalLimiter);

// Swagger UI is disabled in production to avoid exposing the API surface.
if (process.env.NODE_ENV !== "production") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use("/api/users", userRoutes);

app.use("/api/patients", patientRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/visits", clinicVisitRoutes);

app.use("/api/medical-history", medicalHistoryRoutes);

app.use("/api/appointments", appointmentRoutes);

app.use("/api/medicines", medicineRoutes);

app.use("/api/audit-logs", auditLogRoutes);

app.use("/api/reports", reportRoutes);

app.use("/api/analytics", analyticsRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("School clinic API Running");
});

// These two MUST be last - order matters in Express.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;