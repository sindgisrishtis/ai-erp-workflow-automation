/**
 * src/config/logger.js
 *
 * Structured application logger using Winston.
 * - Console output in development (colorized, human-readable)
 * - JSON file output in production (machine-parseable)
 * - Daily rotating log files to prevent unbounded disk growth
 */

"use strict";

const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const env = require("./env");

// ─── Custom log format ────────────────────────────────────────────────────────

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

/** Human-readable format for development console */
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${level}] ${message}${stack ? `\n${stack}` : ""}${metaStr}`;
  })
);

/** Structured JSON format for production files */
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

// ─── Transports ──────────────────────────────────────────────────────────────

const transports = [];

// Always log to console
transports.push(
  new winston.transports.Console({
    format: env.isDev ? devFormat : prodFormat,
  })
);

// In production, also write to rotating log files
if (env.isProd) {
  transports.push(
    new DailyRotateFile({
      filename: path.join(env.LOG_DIR, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "30d",
      maxSize: "20m",
      format: prodFormat,
    }),
    new DailyRotateFile({
      filename: path.join(env.LOG_DIR, "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "14d",
      maxSize: "50m",
      format: prodFormat,
    })
  );
}

// ─── Logger instance ─────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  transports,
  // Don't crash the process on unhandled logger errors
  exitOnError: false,
});

module.exports = logger;