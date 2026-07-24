import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";


// Custom error class - lets controllers throw an error with a
// specific status code attached (e.g. 404, 400) instead of always 500
export class AppError extends Error {

  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
  }

}


// Centralized error handler - this is the LAST piece of middleware
// in server.ts. Every error in the app eventually lands here.
//
// IMPORTANT: error handlers in Express must take exactly 4 arguments
// (req, res, next, AND err first) - that 4-argument shape is how
// Express recognizes this as an error handler instead of a normal route.
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {

  const statusCode = err.statusCode || 500;

  // 4xx errors (validation, access denied, not found) are expected
  // outcomes of normal use - log them as warnings, not full errors.
  // 5xx means something actually broke - log the full error + stack.
  if (statusCode >= 500) {
    logger.error(err);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${statusCode}: ${err.message}`);
  }

  // the client only ever sees a short, safe message -
  // never raw error objects, stack traces, or internal details
  const message = err.message || "Something went wrong on the server";

  res.status(statusCode).json({
    message
  });

};


// Catches requests to URLs that don't match any route at all
// (placed right before errorHandler in server.ts)
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