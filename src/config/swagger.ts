import { createDocument, type ZodOpenApiPathsObject } from "zod-openapi";
import { z } from "zod";
import {
  loginSchema,
  registerSchema,
  updateUserSchema,
  createPatientSchema,
  updatePatientSchema,
  createVisitSchema,
  updateVisitSchema,
  createMedicalHistorySchema,
  updateMedicalHistorySchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  createMedicineSchema,
  updateMedicineSchema,
} from "../validators/schemas";

// ---------------------------------------------------------------------------
// API documentation, generated directly from the same Zod schemas used for
// real request validation. There is exactly one source of truth for what a
// request body looks like - if a schema in validators/schemas.ts changes,
// these docs change with it automatically. Nothing here is hand-typed twice.
// ---------------------------------------------------------------------------

// Generic, reusable response shapes (every controller returns one of these)
const successResponse = (dataSchema: z.ZodType = z.object({})) =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: dataSchema,
  });

const paginatedResponse = (itemSchema: z.ZodType = z.object({})) =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(itemSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  });

const errorResponse = z.object({
  message: z.string(),
});

const validationErrorResponse = z.object({
  message: z.literal("Validation failed"),
  errors: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
    })
  ),
});

const idParam = z.object({
  id: z.string().meta({ description: "MongoDB ObjectId", example: "60f7c2b5e1d3c70015a1b2c3" }),
});

// shape of a single audit log entry, for documentation purposes only -
// this isn't request-validated since GET /audit-logs has no body
const auditLogEntry = z.object({
  _id: z.string(),
  action: z.enum(["create", "update", "delete", "view"]),
  resource: z.string().meta({ example: "Patient" }),
  resourceId: z.string(),
  performedBy: z.union([z.string(), z.object({ _id: z.string(), name: z.string(), role: z.string(), email: z.string() })]),
  changes: z.object({
    before: z.record(z.string(), z.unknown()).optional(),
    after: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  metadata: z.object({
    method: z.string().optional(),
    path: z.string().optional(),
  }).optional(),
  createdAt: z.string(),
});

// shared response set used by nearly every endpoint, keyed by status code
const standardResponses = (successSchema: z.ZodType) => ({
  200: {
    description: "Success",
    content: { "application/json": { schema: successSchema } },
  },
  403: {
    description: "Forbidden - role not allowed",
    content: { "application/json": { schema: errorResponse } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: errorResponse } },
  },
});

const bearerAuth = [{ bearerAuth: [] }];

// ---------------------------------------------------------------------------
// Each entry below is one real route. Path/method/roles act as the doc's
// "header"; the Zod schema supplies the request/response body shape.
// This is intentionally a flat data structure, not repeated YAML comments -
// adding a new endpoint means adding one object here, not 40 lines per route.
// ---------------------------------------------------------------------------

const paths: ZodOpenApiPathsObject = {

  // ----- AUTH -----
  "/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Log in and receive a JWT token",
      security: [],
      requestBody: { content: { "application/json": { schema: loginSchema } } },
      responses: {
        200: {
          description: "Login successful",
          content: { "application/json": { schema: z.object({ token: z.string() }) } },
        },
        400: { description: "Validation failed or invalid password", content: { "application/json": { schema: validationErrorResponse } } },
        404: { description: "User not found", content: { "application/json": { schema: errorResponse } } },
        429: { description: "Too many login attempts" },
      },
    },
  },

  // ----- USERS (admin only) -----
  "/users": {
    post: {
      tags: ["Users"], summary: "Create a new staff account (admin only)", security: bearerAuth,
      requestBody: { content: { "application/json": { schema: registerSchema } } },
      responses: { 201: { description: "User created", content: { "application/json": { schema: successResponse() } } }, ...standardResponses(successResponse()) },
    },
    get: {
      tags: ["Users"], summary: "List all users (admin only)", security: bearerAuth,
      responses: standardResponses(paginatedResponse()),
    },
  },
  "/users/{id}": {
    get: {
      tags: ["Users"], summary: "Get a single user by ID (admin only)", security: bearerAuth,
      requestParams: { path: idParam },
      responses: standardResponses(successResponse()),
    },
    put: {
      tags: ["Users"], summary: "Update a user (admin only)", security: bearerAuth,
      requestParams: { path: idParam },
      requestBody: { content: { "application/json": { schema: updateUserSchema } } },
      responses: standardResponses(successResponse()),
    },
    delete: {
      tags: ["Users"], summary: "Delete a user (admin only)", security: bearerAuth,
      requestParams: { path: idParam },
      responses: standardResponses(successResponse()),
    },
  },

  // ----- PATIENTS -----
  "/patients": {
    post: {
      tags: ["Patients"], summary: "Create a new patient (nurse only)", security: bearerAuth,
      requestBody: { content: { "application/json": { schema: createPatientSchema } } },
      responses: { 201: { description: "Patient created", content: { "application/json": { schema: successResponse() } } }, ...standardResponses(successResponse()) },
    },
    get: {
      tags: ["Patients"], summary: "Get the full patient list, paginated (doctor/nurse only)", security: bearerAuth,
      requestParams: {
        query: z.object({
          page: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
          search: z.string().optional().meta({ description: "Matches firstName, lastName, or studentId" }),
          includeInactive: z.enum(["true", "false"]).optional(),
        }),
      },
      responses: standardResponses(paginatedResponse()),
    },
  },
  "/patients/basic": {
    get: {
      tags: ["Patients"], summary: "Get a lightweight name/ID-only patient list (staff only, not paginated)", security: bearerAuth,
      responses: standardResponses(successResponse()),
    },
  },
  "/patients/{id}": {
    get: {
      tags: ["Patients"], summary: "Get a single patient's full info (doctor/nurse only)", security: bearerAuth,
      requestParams: { path: idParam },
      responses: standardResponses(successResponse()),
    },
    put: {
      tags: ["Patients"], summary: "Update a patient (admin only)", security: bearerAuth,
      requestParams: { path: idParam },
      requestBody: { content: { "application/json": { schema: updatePatientSchema } } },
      responses: standardResponses(successResponse()),
    },
    delete: {
      tags: ["Patients"], summary: "Archive (soft delete) a patient (admin only)", security: bearerAuth,
      requestParams: { path: idParam },
      responses: standardResponses(successResponse()),
    },
  },

  // ----- CLINIC VISITS -----
  "/visits": {
    post: {
      tags: ["Clinic Visits"], summary: "Log a new clinic visit (nurse only)", security: bearerAuth,
      requestBody: { content: { "application/json": { schema: createVisitSchema } } },
      responses: { 201: { description: "Visit logged", content: { "application/json": { schema: successResponse() } } }, ...standardResponses(successResponse()) },
    },
  },
  "/visits/patient/{patientId}": {
    get: {
      tags: ["Clinic Visits"], summary: "Get all visits for a patient, paginated (doctor/nurse only)", security: bearerAuth,
      requestParams: {
        path: z.object({ patientId: z.string() }),
        query: z.object({
          page: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
          search: z.string().optional().meta({ description: "Matches the complaint field" }),
        }),
      },
      responses: standardResponses(paginatedResponse()),
    },
  },
  "/visits/{id}": {
    get: {
      tags: ["Clinic Visits"], summary: "Get a single clinic visit (doctor/nurse only)", security: bearerAuth,
      requestParams: { path: idParam },
      responses: standardResponses(successResponse()),
    },
    put: {
      tags: ["Clinic Visits"], summary: "Update a logged visit (nurse only)", security: bearerAuth,
      requestParams: { path: idParam },
      requestBody: { content: { "application/json": { schema: updateVisitSchema } } },
      responses: standardResponses(successResponse()),
    },
    delete: {
      tags: ["Clinic Visits"], summary: "Archive (soft delete) a visit (admin only)", security: bearerAuth,
      requestParams: { path: idParam },
      responses: standardResponses(successResponse()),
    },
  },

  // ----- MEDICAL HISTORY (no delete - records are permanent) -----
  "/medical-history": {
    post: {
      tags: ["Medical History"], summary: "Create a medical history entry (doctor only)", security: bearerAuth,
      requestBody: { content: { "application/json": { schema: createMedicalHistorySchema } } },
      responses: { 201: { description: "Entry created", content: { "application/json": { schema: successResponse() } } }, ...standardResponses(successResponse()) },
    },
  },
  "/medical-history/patient/{patientId}": {
    get: {
      tags: ["Medical History"], summary: "Get all history entries for a patient, paginated (doctor/nurse, read-only for nurse)", security: bearerAuth,
      requestParams: {
        path: z.object({ patientId: z.string() }),
        query: z.object({
          page: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
        }),
      },
      responses: standardResponses(paginatedResponse()),
    },
  },
  "/medical-history/{id}": {
    get: {
      tags: ["Medical History"], summary: "Get a single history entry (doctor/nurse only)", security: bearerAuth,
      requestParams: { path: idParam },
      responses: standardResponses(successResponse()),
    },
    put: {
      tags: ["Medical History"], summary: "Update a history entry (doctor only)", security: bearerAuth,
      requestParams: { path: idParam },
      requestBody: { content: { "application/json": { schema: updateMedicalHistorySchema } } },
      responses: standardResponses(successResponse()),
    },
  },

  // ----- APPOINTMENTS -----
  "/appointments": {
    post: {
      tags: ["Appointments"], summary: "Book a new appointment (staff only)", security: bearerAuth,
      requestBody: { content: { "application/json": { schema: createAppointmentSchema } } },
      responses: { 201: { description: "Appointment created", content: { "application/json": { schema: successResponse() } } }, ...standardResponses(successResponse()) },
    },
    get: {
      tags: ["Appointments"], summary: "Get all appointments, paginated (staff/nurse/doctor)", security: bearerAuth,
      requestParams: {
        query: z.object({
          page: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
          search: z.string().optional().meta({ description: "Matches the reason field" }),
        }),
      },
      responses: standardResponses(paginatedResponse()),
    },
  },
  "/appointments/{id}": {
    get: {
      tags: ["Appointments"], summary: "Get a single appointment (staff/nurse/doctor)", security: bearerAuth,
      requestParams: { path: idParam },
      responses: standardResponses(successResponse()),
    },
    put: {
      tags: ["Appointments"], summary: "Update an appointment, e.g. cancel it (staff only)", security: bearerAuth,
      requestParams: { path: idParam },
      requestBody: { content: { "application/json": { schema: updateAppointmentSchema } } },
      responses: standardResponses(successResponse()),
    },
  },

  // ----- MEDICINES -----
  "/medicines": {
    post: {
      tags: ["Medicines"], summary: "Add a new medicine to inventory (nurse only)", security: bearerAuth,
      requestBody: { content: { "application/json": { schema: createMedicineSchema } } },
      responses: { 201: { description: "Medicine added", content: { "application/json": { schema: successResponse() } } }, ...standardResponses(successResponse()) },
    },
    get: {
      tags: ["Medicines"], summary: "Get all medicines, paginated (nurse/doctor)", security: bearerAuth,
      requestParams: {
        query: z.object({
          page: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
          search: z.string().optional().meta({ description: "Matches the medicine name" }),
        }),
      },
      responses: standardResponses(paginatedResponse()),
    },
  },
  "/medicines/low-stock": {
    get: {
      tags: ["Medicines"], summary: "Get medicines at or below their low-stock threshold (nurse/doctor, not paginated)", security: bearerAuth,
      responses: standardResponses(successResponse()),
    },
  },
  "/medicines/{id}": {
    get: {
      tags: ["Medicines"], summary: "Get a single medicine (nurse/doctor)", security: bearerAuth,
      requestParams: { path: idParam },
      responses: standardResponses(successResponse()),
    },
    put: {
      tags: ["Medicines"], summary: "Update a medicine's quantity/details (nurse only)", security: bearerAuth,
      requestParams: { path: idParam },
      requestBody: { content: { "application/json": { schema: updateMedicineSchema } } },
      responses: standardResponses(successResponse()),
    },
  },

  // ----- AUDIT LOGS (admin only) -----
  "/audit-logs": {
    get: {
      tags: ["Audit Logs"],
      summary: "Get the full audit trail of create/update/delete/view actions across all resources (admin only)",
      security: bearerAuth,
      requestParams: {
        query: z.object({
          page: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
          resource: z.string().optional().meta({ description: "Filter by resource type, e.g. Patient, ClinicVisit, Medicine" }),
          resourceId: z.string().optional().meta({ description: "Filter to a single record's history" }),
          action: z.enum(["create", "update", "delete", "view"]).optional(),
          performedBy: z.string().optional().meta({ description: "Filter to a single user's activity (user ID)" }),
        }),
      },
      responses: standardResponses(paginatedResponse(auditLogEntry)),
    },
  },

  // ----- REPORTS (admin only) -----
  "/reports/clinic-summary": {
    get: {
      tags: ["Reports"],
      summary: "Generate and download a Word document summarizing clinic activity for a date range (admin only)",
      description:
        "Defaults to the current calendar month if no dates are given. " +
        "Generated entirely from this system's own data - no external AI " +
        "service is called, so the response is near-instant.",
      security: bearerAuth,
      requestParams: {
        query: z.object({
          startDate: z.iso.date().optional().meta({ description: "ISO date, e.g. 2026-06-01. Required if endDate is given." }),
          endDate: z.iso.date().optional().meta({ description: "ISO date, e.g. 2026-06-30. Required if startDate is given." }),
        }),
      },
      responses: {
        200: {
          description: "Word document (.docx) file download",
          content: {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        400: {
          description: "Invalid or incomplete date range",
          content: { "application/json": { schema: errorResponse } },
        },
        403: {
          description: "Forbidden - not admin",
          content: { "application/json": { schema: errorResponse } },
        },
      },
    },
  },
  
};

// Explicit type annotation here, not stylistic: createDocument's return
// type (OpenAPIObject) is defined inside zod-openapi's internals but isn't
// part of its public exports, so TypeScript can't "name" it on its own.
// ReturnType<typeof createDocument> lets us reference that exact type
// without ever needing to import or name it directly.
const swaggerSpec: ReturnType<typeof createDocument> = createDocument({
  openapi: "3.1.0",
  info: {
    title: "School Clinic API",
    version: "1.0.0",
    description:
      "All endpoints (except /auth/login) require a Bearer JWT token, " +
      "obtained by logging in. Pass it as: Authorization: Bearer <token>",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  security: bearerAuth,
  paths,
});

export default swaggerSpec;