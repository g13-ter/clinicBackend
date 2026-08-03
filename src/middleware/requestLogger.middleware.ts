import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import logger from "../utils/logger";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,100}$/;

const requestIdFromHeader = (req: Request): string => {
  const supplied = req.header("x-request-id");
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
};

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = process.hrtime.bigint();
  const requestId = requestIdFromHeader(req);
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const metadata = {
      requestId,
      method: req.method,
      path: req.originalUrl.split("?", 1)[0],
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      ...(req.user ? { userId: req.user.id, role: req.user.role } : {}),
    };

    if (res.statusCode < 400 && req.originalUrl.startsWith("/api/health")) {
      logger.debug("http_request_completed", metadata);
    } else if (res.statusCode >= 500) logger.error("http_request_completed", metadata);
    else if (res.statusCode >= 400) logger.warn("http_request_completed", metadata);
    else logger.info("http_request_completed", metadata);
  });

  next();
};
