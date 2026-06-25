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


// GENERAL limiter for the whole API - much looser, just to
// prevent overall abuse/spam, not normal everyday use
export const generalLimiter = rateLimit({

  windowMs: 15 * 60 * 1000, // 15 minutes

  limit: 200, // 200 requests per IP in that window

  message: {
    message: "Too many requests. Please slow down and try again later."
  },

  standardHeaders: true,

  legacyHeaders: false,

});