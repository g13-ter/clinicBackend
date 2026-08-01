# School Clinic Backend API

A REST API for managing a school clinic's patients, visits, medical history,
appointments, and medicine inventory — with role-based access control, audit
logging, and an automated board report generator.

Built with Node.js, Express, TypeScript, and MongoDB (Mongoose).

---

## Live Deployment

- **Frontend (Vercel):** https://clinic-frontend-git-nursedashboard-scms2.vercel.app/login
- **Backend (Render):** https://clinicbackend-1-slng.onrender.com
- **Database:** MongoDB Atlas

The frontend calls the backend through a Vercel rewrite (`/api/:path*` →
the Render URL above), so from the browser's perspective all requests are
same-origin — see `vercel.json` in the frontend repo. The backend restricts
CORS to known frontend origins via `CLIENT_ORIGIN` (see below); this is a
Vercel branch preview URL, so if you push a new branch you'll get a new
preview URL that also needs to be added there before login will work from it.

---

## Tech stack

- **Express** — web server / routing
- **MongoDB + Mongoose** — database
- **JWT (jsonwebtoken)** — authentication tokens
- **bcryptjs** — password hashing
- **Zod** — request validation, and the single source of truth for the API docs below
- **zod-openapi + swagger-ui-express** — auto-generated, interactive API documentation
- **express-rate-limit** — brute-force login protection
- **winston** — structured logging
- **docx** — generates the clinic summary report as a real Word document
- **Jest + Supertest** — automated testing
- **TypeScript** — language

---

## Getting Started

### 1. Configure environment variables

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

Required:
- `MONGO_URI` — your MongoDB connection string. Make sure it includes a database name (e.g. `.../clinicDB?...`) — without one, MongoDB silently connects to a database called `test`, which is easy to miss.
- `JWT_SECRET` — a long, random string used to sign login tokens

Optional (have safe defaults if omitted):
- `JWT_EXPIRE` — how long a login token stays valid (default: `1d`)
- `PORT` — local server port (default: `5000`; most hosts like Railway set this automatically)
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — used only by the admin-seeding script below (default: `admin@clinic.com` / `admin123`, fine for local dev only — set real values before seeding a production database)

The server checks for `MONGO_URI` and `JWT_SECRET` on startup (and before the test suite runs) and refuses to continue with a clear error message if either is missing.

### 2. Install dependencies

```bash
npm install
```

### 3. Create the first admin account

There is no public registration route — accounts are created by an existing admin only (`POST /api/users`). To bootstrap the very first one:

```bash
npm run seed-admin
```

This creates `admin@clinic.com` / `admin123` directly in your database (or your configured `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`). **Change this password once you're logged in.** The script checks for an existing admin with that email first and does nothing if one already exists — safe to re-run if you ever lose access.

### 4. Run the server

```bash
npm run dev      # development, auto-restarts on file changes
```

You should see:
Server running on Port 5000
MongoDB Connected

For production:
```bash
npm run build    # compiles TypeScript (src/) to JavaScript (dist/)
npm start        # runs the compiled output (dist/server.js)
```

### 5. View the interactive API docs

With the server running, open:
http://localhost:5000/api-docs

This is a live Swagger UI, generated directly from this project's own Zod validation schemas — the docs literally cannot drift out of sync with real request validation, because they're built from the same source. Click **Authorize**, paste a JWT obtained from `POST /auth/login`, and you can try every real endpoint directly from the browser.

---

## Available Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Runs the server in development mode with auto-restart (nodemon) |
| `npm run build` | Compiles TypeScript (`src/`) to JavaScript (`dist/`) |
| `npm start` | Runs the compiled server (`dist/server.js`) — used in production |
| `npm test` | Runs the full Jest test suite against a real database |
| `npm run seed-admin` | Creates the first admin account |

See also: [Architecture & security guide](../docs/ARCHITECTURE.md) (RBAC matrix, health checks, deployment, CI).

---

## Health check

```
GET /api/health
```

Public endpoint (no auth). Returns `200` when MongoDB is connected, `503` when degraded. Use for load balancers and uptime monitoring.

---

## Accounts & Roles

There is no public sign-up route. New staff accounts (any role) are created by an existing admin through `POST /api/users`. This prevents anyone from registering themselves as `admin` directly.

There are 4 roles:

| Role | Summary |
|---|---|
| `admin` | Manages staff accounts. Updates/archives patient basic info. Views audit logs and generates board reports. Cannot touch medical records directly. |
| `doctor` | Reviews nurse-recorded triage, records diagnosis and treatment, issues prescriptions, and generates consultation certificates. |
| `nurse` | Checks in students, records vitals and nursing assessments, and manages medicine inventory and appointments. Read-only on physician medical history. |
| `staff` | Manages appointments. Sees a basic (non-medical) patient list only. |

---

## Authentication

Every route except `POST /api/auth/login` requires a JWT token, sent as a header:
Authorization: Bearer <your token here>

You get a token back from `/api/auth/login`. Five failed attempts for the same account trigger a two-minute cooldown. Successful logins do not count, and a broader IP limit protects against automated guessing across multiple accounts. A general rate limit also applies across the whole API.

---

## Response format

Every successful response follows the same shape:

```json
{
  "success": true,
  "message": "Patients retrieved successfully",
  "data": { }
}
```

List endpoints additionally include pagination metadata:

```json
{
  "success": true,
  "message": "Patients retrieved successfully",
  "data": [ ],
  "pagination": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

Errors follow a simpler shape and never include a raw stack trace:

```json
{ "message": "Patient not found" }
```

Validation failures additionally include a field-level breakdown:

```json
{
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Must be a valid email" }
  ]
}
```

---

## Data safety note

Patients and clinic visits are never truly deleted. Instead, an admin can **archive** them (`isActive` flips to `false`). This keeps records available for audits or future reference while hiding them from everyday active lists. Medical history has no delete/archive endpoint at all by design — those records are meant to be permanent and amendable, but never erased.

---

## List endpoint features

Every list endpoint (`GET /patients`, `GET /medicines`, etc.) supports:

- **Pagination** — `?page=&limit=` (limit capped at 100, defaults to page 1, limit 10)
- **Search** — `?search=` on relevant fields (patient name/student ID, visit complaint, medicine name, appointment reason). Special regex characters in the search term are escaped before being used in the underlying query.
- **Population** — related records show the staff member who created/last updated them (`name`, `role`), not just a raw MongoDB ID

---

## Audit Log

Every **create, update, and delete** across all six resources (patients, visits, medical history, appointments, medicines, users) is permanently recorded — who did it, when, and (for updates/deletes) a before/after snapshot of what changed.

**Read-only actions (lists, detail views, dashboard loads) are not logged** — logging every page view would flood the audit trail with noise and make real changes hard to find.

This is a different, separate system from the `createdBy`/`updatedBy` fields you'll see on individual records — those only ever reflect the most recent change to that record. The audit log keeps the full history forever, even after a record has been edited many times since.

- Audit writes are fire-and-forget: they run in the background and never slow down or fail the actual request, even if the log write itself fails (which gets reported through the normal app logger instead)
- Passwords (hashed or not) are explicitly stripped before any User action is logged
- Viewable via `GET /api/audit-logs` (**admin only**), filterable by `resource`, `action`, `resourceId`, or `performedBy` (a user ID), with the same pagination as other list endpoints

---

## Clinic Summary Report

`GET /api/reports/clinic-summary` (**admin only**) generates a downloadable Word document (`.docx`) matching the standard School Clinic Monthly Report format.

- Defaults to the current calendar month if no dates are given
- Accepts a custom range via `?startDate=2026-06-01&endDate=2026-06-30`
- Returns the file as a binary download with the correct `.docx` content type and filename

**This is not powered by an external AI service.** It's a deterministic template: real statistics (clinic attendance by gender, most frequently reported complaints, current medicine stock, low-stock alerts) are pulled straight from the database and rendered into proper report language — with correct singular/plural grammar handled automatically. This makes it instant, free to run, dependency-free (nothing external that can fail, rate-limit, or change behavior unexpectedly), and accurate to the underlying data every single time.

Sections the system genuinely doesn't track yet — Health Programs and Activities, Referrals, and Accidents/Emergencies as their own distinct category — are clearly labeled "Not tracked by system - please complete manually" in the generated document, rather than shown as empty tables. This avoids anyone mistaking "this system has no data for this section" for "nothing happened during this period."

Header fields (School name, Clinic name, Prepared by, Date submitted, signatures) are left as blank lines in the document for the nurse/admin to fill in by hand after downloading, since this system doesn't track that information.

---

## Validation

Every POST/PUT route validates its request body with Zod before it reaches a controller or the database. Unknown fields in the request body are silently stripped during validation — only fields explicitly defined in the schema make it through, which also closes off a class of privilege-escalation attempts (e.g. a non-admin trying to sneak `role: "admin"` into an unrelated request body).

If validation fails, you get a `400` response shaped like this:

```json
{
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Must be a valid email" }
  ]
}
```

All validation schemas live in `src/validators/schemas.ts` — and are the same schemas used to generate the Swagger docs at `/api-docs`, so the two can never drift apart.

---

## Error handling & logging

All errors flow through one centralized handler (`src/middleware/error.middleware.ts`). Controllers throw an `AppError(message, statusCode)` and pass it to `next()`; the handler logs the error and sends back only a short, safe message to the client — never a raw stack trace. Unmatched routes return a clean JSON 404 instead of Express's default HTML error page.

Logging is handled by Winston (`src/utils/logger.ts`), console-only by design: this app targets Render, whose filesystem is ephemeral (anything written to disk disappears on every redeploy), so logs are meant to be read from Render's own dashboard rather than from a local file. 4xx errors (validation failures, access denied, not found) log as warnings; 5xx errors (something actually broke) log with full detail.

---

## Testing

```bash
npm test
```

Tests use Jest + Supertest and run against your real database (the same `MONGO_URI` from `.env` — see the note below), one test file at a time rather than in parallel, since they share state. Each test file creates its own throwaway users/patients/records (clearly prefixed with `TEST_` or `TEST-`) and cleans them up afterward.

Coverage includes:
- Full CRUD + role-based access control for every resource
- Audit log correctness — real actions produce real entries with accurate before/after diffs, filtering works, and passwords are never present in any logged snapshot
- Report generation — access control, date-range validation, binary file integrity (.docx files are ZIP archives under the hood, and the tests confirm the response actually starts with a valid ZIP signature), and focused unit tests on the underlying statistics logic (gender counting, complaint grouping, archived-record exclusion, low-stock detection)

**Note on the database:** these tests write to and delete from whatever database `MONGO_URI` points to. Since this project uses the same database for development and testing, running tests will create and remove test records in your real data. If you want to isolate this, point a separate `MONGO_URI` (e.g. a second database in the same Atlas cluster) at test runs instead.

---

## Project structure
src/
app.ts              builds the Express app (routes, middleware) without starting a server
server.ts           entry point: validates env vars, connects to DB, starts app.listen()
config/
db.ts             MongoDB connection
swagger.ts        builds the OpenAPI document from Zod schemas, served at /api-docs
controllers/        HTTP layer only - reads req, calls a service, sends a response
services/           all business logic and database queries
models/             Mongoose schemas (the database "shape")
routes/             URL endpoints, wired to controllers + middleware chains
middleware/
auth.middleware.ts        verifies the JWT, attaches the user to req
role.middleware.ts        checks the user's role against an allowed list
validate.middleware.ts    validates + sanitizes the request body against a Zod schema
rateLimit.middleware.ts   login + general rate limiting
error.middleware.ts       centralized error handling, AppError class, 404 handler
validators/
schemas.ts        Zod schemas - single source of truth for both validation and API docs
utils/
pagination.ts     shared page/limit/skip parsing and metadata building
regex.ts          escapes user search input before it's used in a $regex query
logger.ts         Winston logger (console-only, Railway-friendly)
validateEnv.ts    fails fast at startup if required env vars are missing
auditLog.ts       fire-and-forget helper that writes one audit log entry
reportDocx.ts     builds the .docx clinic summary report
tests/
helpers.ts          shared test utilities (create a test user of any role + log in)
jest.setup.ts       validates env vars once before any test suite runs
seedAdmin.ts        one-time script to create the first admin account
*.test.ts           one test file per feature

`app.ts` and `server.ts` are split on purpose: tests import `app.ts` directly so Supertest can simulate requests without opening a real network port, while `server.ts` is the only file that actually calls `app.listen()`.

---

## How a request flows through the code
Request -> server.ts (matches URL prefix)
-> routes/*.routes.ts (matches exact path + method)
-> rate limiter (login route only, or the general limiter for everything)
-> protect middleware (checks the JWT is valid, attaches user to req)
-> allowRoles middleware (checks the user's role is allowed for this route)
-> validateBody middleware (validates + sanitizes the request body, POST/PUT only)
-> controller function (reads req, calls a service, builds the response)
-> service function (the actual business logic + MongoDB query)
-> (in parallel, fire-and-forget) audit log entry written, if applicable
-> response sent back (or forwarded to the central error handler if anything threw)

---

## Deployment notes (Render + Vercel)

- **Backend (Render):** set `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, and `CLIENT_ORIGIN` as environment variables in Render's dashboard (use a fresh `JWT_SECRET`, don't reuse your local dev one). `PORT` is set automatically by Render.
- `CLIENT_ORIGIN` must list every frontend origin allowed to call this API, comma-separated (e.g. your production Vercel domain plus any preview-branch URLs you're actively testing). Requests from any other origin are rejected with a `403 Request origin is not allowed`.
- If using MongoDB Atlas, allow access from `0.0.0.0/0` in Atlas's Network Access settings, since Render doesn't provide a fixed outbound IP to allowlist individually.
- **Frontend (Vercel):** set a `vercel.json` at the project root rewriting `/api/:path*` to this backend's URL, so API calls stay same-origin from the browser and avoid CORS/cookie cross-domain issues entirely. The catch-all `/(.*)→/index.html` rewrite must come after the `/api` rule.
- Logging is console-only (see below) — read logs from Render's own dashboard rather than a local file, since Render's filesystem is ephemeral like Railway's.