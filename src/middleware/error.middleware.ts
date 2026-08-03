import { Request, Response, NextFunction } from "express";
import logger, { errorMetadata } from "../utils/logger";
import { randomUUID } from "node:crypto";


// Application error with an HTTP status code.
export class AppError extends Error {

  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
  }

}


// Express identifies error handlers by their four-argument signature.
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const errorDetails =
    typeof err === "object" && err !== null
      ? err as { statusCode?: unknown; message?: unknown }
      : {};
  const statusCode =
    typeof errorDetails.statusCode === "number" ? errorDetails.statusCode : 500;
  const message =
    typeof errorDetails.message === "string"
      ? errorDetails.message
      : "Something went wrong on the server";
  const errorId = req.requestId || randomUUID();

  if (statusCode >= 500) {
    logger.error("request_failed", {
      errorId,
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode,
      ...(req.user ? { userId: req.user.id, role: req.user.role } : {}),
      ...errorMetadata(err),
    });
  }

  res.status(statusCode).json({
    message: statusCode >= 500 ? "Something went wrong on the server" : message,
    ...(statusCode >= 500 ? { errorId } : {}),
  });
};


// Convert unmatched routes into application errors.
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {

  const error = new AppError(
    `Route not found: ${req.method} ${req.originalUrl}`,
    404
  );

  next(error);

};
