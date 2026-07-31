import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { jwtPayloadSchema } from "../types/auth";
import User from "../models/user.model";
import { getRequestToken } from "../utils/sessionToken";

export const protect = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  void authenticate(req, res, next);
};

const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = getRequestToken(req);
    if (!token) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);

    const parsed = jwtPayloadSchema.safeParse(decoded);

    if (!parsed.success) {
      res.status(401).json({
        message: "Invalid token payload",
      });
      return;
    }

    // Re-check the live account on every request. This immediately revokes
    // sessions after deactivation, password changes, or role changes.
    const user = await User.findById(parsed.data.id).select("+sessionVersion");
    if (!user || !user.isActive || user.sessionVersion !== parsed.data.sv) {
      res.status(401).json({ message: "Session is no longer valid" });
      return;
    }

    req.user = {
      ...parsed.data,
      role: user.role,
    };

    next();
  } catch {
    res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};
