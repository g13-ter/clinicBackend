import express from "express";
import request from "supertest";
import { Writable } from "node:stream";
import winston from "winston";
import { errorHandler } from "../src/middleware/error.middleware";
import { requestLogger } from "../src/middleware/requestLogger.middleware";
import logger from "../src/utils/logger";

describe("structured request logging", () => {
  const app = express();
  app.use(requestLogger);
  app.get("/ok", (_req, res) => res.json({ ok: true }));
  app.get("/boom", (_req, _res, next) => next(new Error("Test failure")));
  app.use(errorHandler);

  it("preserves a valid caller request ID", async () => {
    const response = await request(app)
      .get("/ok")
      .set("X-Request-ID", "test-request-1234");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("test-request-1234");
  });

  it("replaces an unsafe request ID", async () => {
    const response = await request(app)
      .get("/ok")
      .set("X-Request-ID", "bad id with spaces");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses the request ID as the public server error ID", async () => {
    const response = await request(app)
      .get("/boom")
      .set("X-Request-ID", "error-request-1234");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: "Something went wrong on the server",
      errorId: "error-request-1234",
    });
    expect(response.headers["x-request-id"]).toBe("error-request-1234");
  });
});

describe("log privacy", () => {
  it("redacts credentials and clinical fields from metadata", async () => {
    let output = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const transport = new winston.transports.Stream({ stream });
    logger.add(transport);

    logger.info("privacy_test", {
      password: "never-log-this-password",
      medicalAlerts: { notes: "never-log-this-clinical-note" },
      authorization: "Bearer never-log-this-token",
      recipient: "private.student@example.com",
      safeEvent: "student_record_accessed",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    logger.remove(transport);

    expect(output).toContain("[REDACTED]");
    expect(output).toContain("student_record_accessed");
    expect(output).not.toContain("never-log-this-password");
    expect(output).not.toContain("never-log-this-clinical-note");
    expect(output).not.toContain("never-log-this-token");
    expect(output).not.toContain("private.student@example.com");
  });
});
