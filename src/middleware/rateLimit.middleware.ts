import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { createHash } from "node:crypto";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import { jwtPayloadSchema } from "../types/auth";
import { getRequestToken } from "../utils/sessionToken";
import { MongoRateLimitStore } from "../services/mongoRateLimitStore";

const LOGIN_WINDOW_MS = 2 * 60 * 1000;
const productionStore = (prefix: string) =>
  process.env.NODE_ENV === "production"
    ? { store: new MongoRateLimitStore(prefix) }
    : {};

const verifiedBearerToken = (req: Request): string | null => {
  const token = getRequestToken(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    return jwtPayloadSchema.safeParse(decoded).success ? token : null;
  } catch {
    return null;
  }
};

// Limit failures per account so clinic users sharing one network do not block each other.
export const loginLimiter = rateLimit({
  ...productionStore("login-account:"),

  windowMs: LOGIN_WINDOW_MS,

  limit: 5,

  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    return email || ipKeyGenerator(req.ip ?? "");
  },

  skipSuccessfulRequests: true,

  message: {
    message: "Too many failed login attempts. Please try again in 2 minutes."
  },

  standardHeaders: true, // Expose RateLimit-* headers

  legacyHeaders: false,

});

// Also cap broad password guessing across many accounts from one source.
export const loginIpLimiter = rateLimit({
  ...productionStore("login-ip:"),
  windowMs: LOGIN_WINDOW_MS,
  limit: 30,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  skipSuccessfulRequests: true,
  message: {
    message: "Too many failed login attempts. Please try again in 2 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
});


// Allows normal staff traffic and background polling from shared IPs.
export const generalLimiter = rateLimit({
  ...productionStore("general:"),

  windowMs: 15 * 60 * 1000, // 15 minutes

  limit: 1500, // Per IP per window

  // Authenticated application traffic is already protected by JWT and
  // role-based authorization. Never interrupt normal clinic work with the
  // anonymous-traffic limiter.
  skip: (req) => verifiedBearerToken(req) !== null,

  // Clinic staff commonly share one public IP. Keep authenticated users from
  // consuming one another's allowance while retaining an IP fallback.
  keyGenerator: (req) => {
    const token = verifiedBearerToken(req);
    if (token) {
      const sessionKey = createHash("sha256").update(token).digest("hex");
      return `session:${sessionKey}`;
    }
    return `ip:${ipKeyGenerator(req.ip ?? "")}`;
  },

  message: {
    message: "Too many requests. Please slow down and try again later."
  },

  standardHeaders: true,

  legacyHeaders: false,

});
