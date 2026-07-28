import mongoose from "mongoose";
import type { Request, Response } from "express";

export const getHealth = (_req: Request, res: Response): void => {
  const dbConnected = mongoose.connection.readyState === 1;

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    uptime: process.uptime(),
    database: dbConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
    release: process.env.RELEASE_SHA || process.env.npm_package_version || "development",
  });
};

export const getLiveness = (_req: Request, res: Response): void => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    release: process.env.RELEASE_SHA || process.env.npm_package_version || "development",
  });
};
