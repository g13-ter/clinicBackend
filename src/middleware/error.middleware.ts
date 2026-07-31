import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
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
  const errorId = randomUUID();

  if (statusCode >= 500) {
  const release = process.env.RELEASE_SHA || "development";
  const detail = err instanceof Error ? (err.stack || err.message) : String(err);
  logger.error(
    `[${errorId}] (release ${release}) ${req.method} ${req.originalUrl} -> ${detail}`
  );
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
