import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { jwtPayloadSchema } from "../types/auth";

export const protect = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Require a Bearer token.
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({
        message: "Authorization header must start with Bearer",
      });
      return;
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
  res.status(401).json({
    message: "Token missing",
  });
  return;
}

    // Verify and validate the token before trusting its payload.
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    );

    const parsed = jwtPayloadSchema.safeParse(decoded);

    if (!parsed.success) {
      res.status(401).json({
        message: "Invalid token payload",
      });
      return;
    }

    // Attach the authenticated user for downstream handlers.
    req.user = parsed.data;

    next();

  } catch {
    res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}; 
