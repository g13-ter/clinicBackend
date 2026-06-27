import winston from "winston";

// Centralized logger for the whole app. Replaces scattered
// console.log/console.error calls with structured, leveled logs
// that include a timestamp.
//
// Console-only on purpose: this app runs on Railway, whose
// filesystem is ephemeral (anything written to disk disappears on
// every redeploy/restart). Railway captures stdout/stderr directly
// and shows it in its own Logs tab, so writing to local log files
// would just waste disk I/O for no benefit. If this ever moves to
// a host with a persistent filesystem, file transports can be
// added back here.
//
// Log levels used in this app, from most to least severe:
//   error - something broke (DB connection failed, unhandled request error)
//   warn  - unexpected but recoverable (not used much yet, room to grow)
//   info  - normal lifecycle events (server started, DB connected)

const isProduction = process.env.NODE_ENV === "production";

const logFormat = (info: winston.Logform.TransformableInfo): string => {
  const { timestamp, level, message, stack } = info;
  return `[${timestamp}] ${String(level).toUpperCase()}: ${stack || message}`;
};

const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf(logFormat)
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(logFormat)
      ),
    }),
  ],
});

export default logger;