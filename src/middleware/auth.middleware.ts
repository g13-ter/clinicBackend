import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const protect = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "No token provided"
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Token missing"
      });
    }

    // process.env.JWT_SECRET is guaranteed to exist here because
    // server.ts checks for it on startup and exits if it's missing
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    );

    (req as any).user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      message: "Invalid token"
    });

  }
};