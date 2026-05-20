/**
 * src/config/env.js
 *
 * Centralized environment configuration with validation.
 * Fails fast on startup if required variables are missing —
 * prevents hard-to-debug runtime errors in production.
 */

"use strict";

require("dotenv").config();

/**
 * Validate that a required env variable exists and is non-empty.
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `[Config] Missing required environment variable: ${name}\n` +
      `  → Copy .env.example to .env and fill in all values.`
    );
  }
  return value.trim();
}

/**
 * Parse a comma-separated string into an array of trimmed strings.
 * @param {string} str
 * @returns {string[]}
 */
function parseList(str) {
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Validate & export ────────────────────────────────────────────────────────

const env = {
  // Server
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "5000", 10),
  isDev: (process.env.NODE_ENV || "development") === "development",
  isProd: process.env.NODE_ENV === "production",

  // Database
  DATABASE_URL: requireEnv("DATABASE_URL"),

  // JWT
  JWT_ACCESS_SECRET: requireEnv("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: requireEnv("JWT_REFRESH_SECRET"),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  // Cookies
  COOKIE_SECRET: process.env.COOKIE_SECRET || "nexuserp_cookie_secret_dev",
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE || "lax",

  // CORS
  ALLOWED_ORIGINS: parseList(
    process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000"
  ),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "10", 10),

  // AI
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || "debug",
  LOG_DIR: process.env.LOG_DIR || "./logs",
};

module.exports = env;