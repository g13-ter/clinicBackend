import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const LOGIN_WINDOW_MS = 2 * 60 * 1000;

// Limit failures per account so clinic users sharing one network do not block each other.
export const loginLimiter = rateLimit({

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

  windowMs: 15 * 60 * 1000, // 15 minutes

  limit: 1500, // Per IP per window

  message: {
    message: "Too many requests. Please slow down and try again later."
  },

  standardHeaders: true,

  legacyHeaders: false,

});
