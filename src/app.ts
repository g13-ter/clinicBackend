import express, { Application, Request, Response } from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger";
import userRoutes from "./routes/user.routes";
import patientRoutes from "./routes/patient.routes";
import authRoutes from "./routes/auth.routes";
import clinicVisitRoutes from "./routes/clinicVisit.routes";
import medicalHistoryRoutes from "./routes/medicalHistory.routes";
import appointmentRoutes from "./routes/appointment.routes";
import medicineRoutes from "./routes/medicine.routes";
import { generalLimiter } from "./middleware/rateLimit.middleware";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware";
import auditLogRoutes from "./routes/auditLog.routes";
import reportRoutes from "./routes/report.routes";

// This file ONLY builds the Express app - it does NOT start a
// real network server (no app.listen here). That's what makes it
// safe for tests to import: Supertest can simulate requests against
// this app directly, in-memory, without opening a real port.
//
// server.ts (the real entry point) imports this app and is the
// ONLY place that actually calls app.listen().

const app: Application = express();

app.use(cors());
app.use(express.json());

// applies to every route below this line
app.use(generalLimiter);

// interactive API documentation - visit /api-docs once the server is running
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/users", userRoutes);

app.use("/api/patients", patientRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/visits", clinicVisitRoutes);

app.use("/api/medical-history", medicalHistoryRoutes);

app.use("/api/appointments", appointmentRoutes);

app.use("/api/medicines", medicineRoutes);

app.use("/api/audit-logs", auditLogRoutes);

app.use("/api/reports", reportRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("School clinic API Running");
});

// These two MUST be last - order matters in Express.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;