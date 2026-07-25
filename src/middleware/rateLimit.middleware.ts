import rateLimit from "express-rate-limit";


// STRICT limiter for login - this is the door attackers try to
// brute-force, so it gets the tightest limit
export const loginLimiter = rateLimit({

  windowMs: 15 * 60 * 1000, // 15 minutes

  limit: 5, // only 5 attempts per IP in that window

  message: {
    message: "Too many login attempts. Please try again in 15 minutes."
  },

  standardHeaders: true, // sends RateLimit-* headers so clients can see their status

  legacyHeaders: false,

});


// GENERAL limiter for the whole API - loose enough to cover normal use
// PLUS background polling (NotificationBell polls /dashboard/stats every
// 30s, PatientQueuePage polls /visits/queue every 15s while open) across
// multiple staff potentially sharing one network/IP. 200 was fine before
// those polling features existed; it isn't anymore.
export const generalLimiter = rateLimit({

  windowMs: 15 * 60 * 1000, // 15 minutes

  limit: 1500, // ~100 requests/min sustained - comfortably covers several
               // concurrent staff each with the notification bell and/or
               // patient queue page polling in the background, plus normal
               // clicking around, while still capping runaway abuse.

  message: {
    message: "Too many requests. Please slow down and try again later."
  },

  standardHeaders: true,

  legacyHeaders: false,

});