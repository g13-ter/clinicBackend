import { Request, Response, NextFunction } from "express";

// For endpoints meant to be called by a trusted system (an external cron
// job, a deploy hook) rather than a logged-in user - so they use a shared
// secret header instead of the normal JWT flow. If INTERNAL_API_KEY isn't
// configured, these endpoints are locked out entirely rather than left
// open, since an unset secret is not a safe "allow all" default.
export const requireInternalKey = (req: Request, res: Response, next: NextFunction): void => {
  const configuredKey = process.env.INTERNAL_API_KEY;

  if (!configuredKey) {
    res.status(503).json({
      success: false,
      message: "This endpoint is not configured. Set INTERNAL_API_KEY to enable it.",
    });
    return;
  }

  const providedKey = req.header("x-internal-api-key");

  if (providedKey !== configuredKey) {
    res.status(401).json({ success: false, message: "Invalid or missing internal API key" });
    return;
  }

  next();
};