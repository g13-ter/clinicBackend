import mongoose from "mongoose";
import type { Request, Response } from "express";

export const getHealth = (_req: Request, res: Response): void => {
  const dbConnected = mongoose.connection.readyState === 1;

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    uptime: process.uptime(),
    database: dbConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
};
