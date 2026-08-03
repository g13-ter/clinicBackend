import winston from "winston";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

const REDACTED = "[REDACTED]";
const SENSITIVE_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "jwt",
  "secret",
  "medicalHistory",
  "medicalAlerts",
  "healthConditions",
  "allergies",
  "chronicConditions",
  "currentMedications",
  "consultationFindings",
  "nursingAssessment",
  "diagnosis",
  "treatment",
  "complaint",
].map((key) => key.toLowerCase()));

const isSensitiveKey = (key: string): boolean =>
  SENSITIVE_KEYS.has(key.toLowerCase());

const sanitizeText = (value: string): string => value
  .replace(/\bBearer\s+[^\s]+/gi, `Bearer ${REDACTED}`)
  .replace(/(mongodb(?:\+srv)?:\/\/)[^@\s]+@/gi, `$1${REDACTED}@`)
  .replace(/\b(password|token|secret)=([^\s&]+)/gi, `$1=${REDACTED}`)
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED);

const redactValue = (value: unknown, seen: WeakSet<object>): unknown => {
  if (typeof value === "string") return sanitizeText(value);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactValue(nested, seen),
    ]),
  );
};

const redactMetadata = winston.format((info) => {
  const seen = new WeakSet<object>();
  for (const key of Object.keys(info)) {
    if (isSensitiveKey(key)) info[key] = REDACTED;
    else if (typeof info[key] === "string") info[key] = sanitizeText(info[key]);
    else if (typeof info[key] === "object") info[key] = redactValue(info[key], seen);
  }
  return info;
});

const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  redactMetadata(),
);

const developmentFormat = winston.format.combine(
  baseFormat,
  winston.format.colorize({ level: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
    const context = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : "";
    return `${timestamp} ${level}: ${stack || message}${context}`;
  }),
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  defaultMeta: {
    service: process.env.SERVICE_NAME || process.env.RENDER_SERVICE_NAME || "school-clinic-api",
    environment: process.env.NODE_ENV || "development",
    release: process.env.RELEASE_SHA || process.env.RENDER_GIT_COMMIT || "development",
  },
  format: isProduction
    ? winston.format.combine(baseFormat, winston.format.json())
    : developmentFormat,
  transports: [
    // Render retains stdout/stderr logs; local files would be ephemeral there.
    new winston.transports.Console({ silent: isTest }),
  ],
  exitOnError: false,
});

export const errorMetadata = (error: unknown): Record<string, unknown> =>
  error instanceof Error
    ? {
        errorName: error.name,
        errorMessage: sanitizeText(error.message),
        errorStack: error.stack ? sanitizeText(error.stack) : undefined,
      }
    : { error: sanitizeText(String(error)) };

export default logger;
