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
import { AppError, notFoundHandler, errorHandler } from "./middleware/error.middleware";
import auditLogRoutes from "./routes/auditLog.routes";
import reportRoutes from "./routes/report.routes";
import monthlyInventoryRoutes from "./routes/monthlyInventory.routes";
import purchaseRequestRoutes from "./routes/purchaseRequest.routes";
import internalRoutes from "./routes/internal.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import systemSettingsRoutes from "./routes/systemSettings.routes";
import notificationRoutes from "./routes/notification.routes";
import inventoryLabelRoutes from "./routes/inventoryLabel.routes";
import { requestLogger } from "./middleware/requestLogger.middleware";
import webhookRoutes from "./routes/webhook.routes";

// Builds the app without opening a port so tests can import it safely.

const app: Application = express();

// Assign correlation IDs before any middleware can reject the request.
app.use(requestLogger);

// Trust the reverse proxy's client IP for rate limits and logs.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use("/api/webhooks", webhookRoutes);

// Accept one or more comma-separated origins.
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => {
    const trimmed = origin.trim();
    try {
      return new URL(trimmed).origin;
    } catch {
      return trimmed;
    }
  })
  .filter(Boolean);

const isDevelopmentLoopbackOrigin = (origin: string): boolean => {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser and same-origin requests.
    if (!origin || allowedOrigins.includes(origin) || isDevelopmentLoopbackOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new AppError("Request origin is not allowed", 403));
    }
  },
  credentials: true,
  exposedHeaders: ["X-Request-ID"],
}));
// Keep a fixed, validated request-size ceiling. This protects API workers from
// oversized JSON bodies and avoids relying on environment-derived parser limits.
app.use(express.json({ limit: "256kb" }));

// Clinical API responses must never be retained by browsers or shared proxies.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Public health check for load balancers and CI.
app.use("/api/health", healthRoutes);

// Authentication has its own failure-based limit. Keep it outside the general
// API limiter so dashboard traffic and polling cannot block clinic logins.
app.use("/api/auth", authRoutes);

// Apply the general limit to authenticated application routes below.
app.use(generalLimiter);

// Swagger UI is disabled in production to avoid exposing the API surface.
if (process.env.NODE_ENV !== "production") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use("/api/users", userRoutes);

app.use("/api/patients", patientRoutes);

app.use("/api/visits", clinicVisitRoutes);

app.use("/api/medical-history", medicalHistoryRoutes);

app.use("/api/appointments", appointmentRoutes);

app.use("/api/medicines", medicineRoutes);
app.use("/api/inventory-labels", inventoryLabelRoutes);

app.use("/api/audit-logs", auditLogRoutes);

app.use("/api/reports", reportRoutes);
app.use("/api/monthly-inventory", monthlyInventoryRoutes);

app.use("/api/purchase-requests", purchaseRequestRoutes);

app.use("/api/internal", internalRoutes);

app.use("/api/dashboard", dashboardRoutes);

app.use("/api/system-settings", systemSettingsRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("School clinic API Running");
});

// Keep fallback and error handlers last.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
