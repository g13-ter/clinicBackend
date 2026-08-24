# School Clinic Backend API

A REST API for managing a school clinic's patients, visits, medical history,
appointments, and medicine inventory — with role-based access control, audit
logging, and an automated board report generator.

Built with Node.js, Express, TypeScript, and MongoDB (Mongoose).

---

## Live Deployment

- **Frontend (Vercel):** https://clinic-frontend-zx67-git-nursedashboard-scms2.vercel.app/
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

## Run locally

### Prerequisites

- Node.js 22 or newer
- npm
- A MongoDB database. MongoDB Atlas is the easiest option because it supports
  transactions. A local replica set also works.

If you use a normal standalone MongoDB server for development, set
`MONGO_TRANSACTIONS_ENABLED=false`. Do not disable transactions in production.

### 1. Install dependencies

From the `backend` directory:

```bash
npm ci
```

Use `npm install` instead when you intentionally want to update dependencies or
the lockfile.

### 2. Create `backend/.env`

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

At minimum, set these values:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/school_clinic
JWT_SECRET=replace-this-with-at-least-32-random-characters
CLIENT_ORIGIN=http://localhost:5173
PORT=5000

# Keep true for Atlas or a replica set. Use false only for standalone local MongoDB.
MONGO_TRANSACTIONS_ENABLED=false
```

Generate a secure JWT secret with `npm run generate-secret`, then paste the
generated value into `JWT_SECRET`. The server refuses to start if `MONGO_URI` is
missing or `JWT_SECRET` is shorter than 32 characters. Email, webhook, backup,
report-header, and background-worker variables in `.env.example` are optional
for normal local development.

For MongoDB Atlas, replace `MONGO_URI` with the connection string from Atlas,
include a database name such as `/school_clinic`, allow your current IP address,
and set `MONGO_TRANSACTIONS_ENABLED=true`.

### 3. Create the first account

There is no public sign-up page. Seed the initial administrator before trying
to log in:

```bash
npm run seed-admin
```

The local defaults are:

- Email: `admin@clinic.com`
- Password: `admin123`
- Role: `admin`

Change these before seeding with `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, and
optionally `SEED_ADMIN_ROLE=superadmin` in `.env`. The command does nothing when
an account with that email already exists. Change the default password after
your first login.

### 4. Start the API

```bash
npm run dev
```

Nodemon restarts the API when source files change. Once MongoDB connects, use:

- API: <http://localhost:5000/api>
- Readiness check: <http://localhost:5000/api/health/ready>
- Swagger UI: <http://localhost:5000/api-docs>

Keep this terminal running while using the frontend. The frontend README
explains how to start the web app in a second terminal. From the repository
root, `npm run dev` can also start both applications after their dependencies
and the backend environment have been prepared.

### Production-style local run

```bash
npm run build
npm start
```

This compiles `src/` to `dist/` and runs the compiled server.

### Common startup problems

- **Missing environment variable:** confirm this file is named
  `backend/.env`, not `.env.example` or `.env.txt`.
- **MongoDB connection timeout:** start your local MongoDB service, or check
  the Atlas username, password, IP allowlist, and database URL.
- **Transactions require a replica set:** use Atlas/a local replica set, or set
  `MONGO_TRANSACTIONS_ENABLED=false` for standalone local development.
- **Port 5000 is already in use:** stop the other process or change `PORT` in
  `.env`; if you change it, also update the frontend proxy in
  `frontend/vite.config.ts`.

---

## Available Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Runs the server in development mode with auto-restart (nodemon) |
| `npm run build` | Compiles TypeScript (`src/`) to JavaScript (`dist/`) |
| `npm start` | Runs the compiled server (`dist/server.js`) — used in production |
| `npm run typecheck` | Checks TypeScript without writing build output |
| `npm test` | Runs Jest against the separate database in `MONGO_TEST_URI` |
| `npm run check` | Runs type-checking, tests, and a production build |
| `npm run seed-admin` | Creates the first admin account |
| `npm run generate-secret` | Prints a random 32-byte secret for `JWT_SECRET` |

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

There are 5 roles:

| Role | Summary |
|---|---|
| `superadmin` | Manages protected administrative accounts and role permissions. |
| `admin` | Manages staff accounts. Updates/archives patient basic info. Views audit logs and generates board reports. Cannot touch medical records directly. |
| `doctor` | Reviews nurse-recorded triage, records diagnosis and treatment, issues prescriptions, and generates consultation certificates. |
| `nurse` | Checks in students, records vitals and nursing assessments, and manages medicine inventory and appointments. Read-only on physician medical history. |
| `staff` | Manages appointments. Sees a basic (non-medical) patient list only. |

Sensitive Super Admin operations use step-up verification. Creating or changing
Admin or Super Admin accounts, resetting passwords, and activating or deactivating
privileged accounts require the acting Super Admin's current password. The
password is validated server-side and is never stored in an audit record.

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

- User-account mutations and their success audit record run in the same MongoDB transaction when transactions are enabled, so they commit or roll back together. Production requires transactions.
- Rejected account creation, update, password-reset, activation, and deactivation attempts are recorded for security review.
- Other resource audit writes remain best-effort and report failures through the normal app logger.
- Passwords (hashed or not) are explicitly stripped before any User action is logged
- Viewable via `GET /api/audit-logs` by Admin and Super Admin, filterable by `resource`, `action`, `resourceId`, or `performedBy` (a user ID), with the same pagination as other list endpoints. Regular Admins cannot see protected Super Admin activity.

### Backup verification

`npm run backup:create` creates an authenticated, encrypted MongoDB archive. Run `npm run backup:verify -- <backup-file.scb>` after every scheduled backup; verification authenticates and decrypts the file, fully decompresses the MongoDB archive, and rejects an empty payload. Schedule a real restore drill into an isolated database before production launch.

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

Logging is handled by Winston (`src/utils/logger.ts`), console-only by design: this app targets Render, whose filesystem is ephemeral (anything written to disk disappears on every redeploy), so logs are meant to be read from Render's own dashboard rather than from a local file.

- Production emits one-line JSON that Render can search by `level`, `requestId`, `statusCode`, `role`, `service`, and `release`.
- Local development emits readable colorized lines.
- Every response includes `X-Request-ID`; a 5xx response also returns the same value as `errorId`, making it easy to find the matching terminal or Render log.
- Request bodies and query strings are never logged. Credentials, tokens, email addresses, and clinical fields are redacted from metadata.
- Successful health checks are `debug` level to avoid filling Render logs; 4xx responses are warnings and 5xx responses are errors.

Set `LOG_LEVEL=debug` locally when troubleshooting, then return it to `info` in production. To watch local logs, run `npm run dev`. On Render, open the backend service and select **Logs**; searching the `errorId` shown to a user finds the matching server event.

---

## Testing

```bash
npm test
```

Tests use Jest + Supertest and run one test file at a time because they share
database state. Set `MONGO_TEST_URI` in `.env` to a dedicated test database whose
name contains `test`, `tests`, or `ci`. The test runner deliberately refuses to
use `MONGO_URI`, which protects development and production data.

The transaction tests need a replica set. An Atlas test database or an
ephemeral local replica set is recommended. Each test creates temporary records
with recognizable test prefixes and cleans them up afterward.

Coverage includes:
- Full CRUD + role-based access control for every resource
- Audit log correctness — real actions produce real entries with accurate before/after diffs, filtering works, and passwords are never present in any logged snapshot
- Report generation — access control, date-range validation, binary file integrity (.docx files are ZIP archives under the hood, and the tests confirm the response actually starts with a valid ZIP signature), and focused unit tests on the underlying statistics logic (gender counting, complaint grouping, archived-record exclusion, low-stock detection)

**Never point `MONGO_TEST_URI` at a database containing real clinic data.**

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
logger.ts         Winston logger (structured, redacted, and Render-friendly)
validateEnv.ts    fails fast at startup if required env vars are missing
auditLog.ts       sanitized audit writer with optional transaction enforcement
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
-> validateBody middleware (validates and sanitizes request bodies where required)
-> controller function (reads req, calls a service, builds the response)
-> service function (the actual business logic + MongoDB query)
-> audit log entry written (transactional for User mutations; best-effort for other resources)
-> response sent back (or forwarded to the central error handler if anything threw)

---

## Deployment notes (Render + Vercel)

- **Backend (Render):** set `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, and `CLIENT_ORIGIN` as environment variables in Render's dashboard (use a fresh `JWT_SECRET`, don't reuse your local dev one). `PORT` is set automatically by Render.
- `CLIENT_ORIGIN` must list every frontend origin allowed to call this API, comma-separated (e.g. your production Vercel domain plus any preview-branch URLs you're actively testing). Requests from any other origin are rejected with a `403 Request origin is not allowed`.
- If using MongoDB Atlas, allow access from `0.0.0.0/0` in Atlas's Network Access settings, since Render doesn't provide a fixed outbound IP to allowlist individually.
- **Frontend (Vercel):** set a `vercel.json` at the project root rewriting `/api/:path*` to this backend's URL, so API calls stay same-origin from the browser and avoid CORS/cookie cross-domain issues entirely. The catch-all `/(.*)→/index.html` rewrite must come after the `/api` rule.
- Logging is console-only (see below) — read logs from Render's own dashboard rather than a local file, since Render's filesystem is ephemeral like Railway's.
