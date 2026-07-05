import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { jwtPayloadSchema } from "../types/auth";

export const protect = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ message: "No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      res.status(401).json({ message: "Token missing" });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    const parsed = jwtPayloadSchema.safeParse(decoded);

    if (!parsed.success) {
      res.status(401).json({ message: "Invalid token" });
      return;
    }

    req.user = parsed.data;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
