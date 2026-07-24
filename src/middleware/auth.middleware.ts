import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { jwtPayloadSchema } from "../types/auth";

export const protect = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // 1. Kuhaa ang Authorization header
    const authHeader = req.headers.authorization;

    // 2. Siguradoha nga naa ang header ug Bearer ang format
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({
        message: "Authorization header must start with Bearer",
      });
      return;
    }

    // 3. Kuhaa ang JWT token
    const token = authHeader.split(" ")[1];

    if (!token) {
  res.status(401).json({
    message: "Token missing",
  });
  return;
}

    // 4. Verify ang token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    );

    // 5. Validate ang payload gamit ang Zod
    const parsed = jwtPayloadSchema.safeParse(decoded);

    if (!parsed.success) {
      res.status(401).json({
        message: "Invalid token payload",
      });
      return;
    }

    // 6. Ibutang ang user sa request
    req.user = parsed.data;

    // 7. Padayon sa sunod nga middleware/controller
    next();

  } catch {
    res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}; 