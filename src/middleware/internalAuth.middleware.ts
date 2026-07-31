import { Request, Response, NextFunction } from "express";

// Authenticate trusted system calls with a shared secret; deny all if unset.
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
