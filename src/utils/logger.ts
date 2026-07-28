import winston from "winston";

// Railway captures stdout/stderr, so file transports are unnecessary.

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
