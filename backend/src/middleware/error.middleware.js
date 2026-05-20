"use strict";

/**
 * src/middleware/error.middleware.js
 *
 * Global error handling middleware for NexusERP.
 *
 * Express error middleware signature requires exactly 4 parameters:
 * (err, req, res, next) — the 4th param tells Express this is an error handler.
 *
 * Two handlers are exported:
 *
 *   notFoundHandler  — catches requests to undefined routes (404)
 *   globalErrorHandler — catches all errors forwarded via next(err) or
 *                        thrown inside async route handlers (via express-async-errors)
 *
 * Error classification:
 *   Operational errors  (err.isOperational = true):
 *     Known, expected business errors from the service layer.
 *     e.g. "Wrong password", "User not found", "Duplicate email"
 *     → Return the error message to the client.
 *
 *   Prisma errors  (err.code starts with "P"):
 *     Database-level errors from Prisma Client.
 *     → Map to appropriate HTTP codes. Sanitize before responding.
 *
 *   Programming / unexpected errors:
 *     Bugs, type errors, unhandled rejections.
 *     → Log the full stack. Return generic 500 to avoid leaking internals.
 */

const logger = require("../config/logger");
const { sendError, HTTP } = require("../utils/response");
const env = require("../config/env");

// ─── Prisma error code → HTTP status mapping ──────────────────────────────────
// Full list: https://www.prisma.io/docs/reference/api-reference/error-reference
const PRISMA_ERROR_MAP = {
  P2000: { status: HTTP.BAD_REQUEST,   message: "The provided value is too long for this field." },
  P2001: { status: HTTP.NOT_FOUND,     message: "The requested record does not exist." },
  P2002: { status: HTTP.CONFLICT,      message: "A record with this value already exists." },    // Unique constraint
  P2003: { status: HTTP.BAD_REQUEST,   message: "A related record was not found." },              // FK violation
  P2004: { status: HTTP.BAD_REQUEST,   message: "A database constraint failed." },
  P2005: { status: HTTP.BAD_REQUEST,   message: "An invalid value was provided for a field." },
  P2006: { status: HTTP.BAD_REQUEST,   message: "The provided value is invalid." },
  P2011: { status: HTTP.BAD_REQUEST,   message: "A required field is missing." },                 // Null constraint
  P2014: { status: HTTP.BAD_REQUEST,   message: "The change you are trying to make would break a required relation." },
  P2015: { status: HTTP.NOT_FOUND,     message: "A related record could not be found." },
  P2025: { status: HTTP.NOT_FOUND,     message: "The record to update or delete does not exist." },
};

// ─── Helper: extract a user-friendly Prisma message ──────────────────────────
function prismaErrorDetails(err) {
  const mapped = PRISMA_ERROR_MAP[err.code];
  if (mapped) return mapped;

  // P2002 duplicate — extract which field caused it if Prisma provides meta
  if (err.code === "P2002" && err.meta?.target) {
    const fields = Array.isArray(err.meta.target)
      ? err.meta.target.join(", ")
      : err.meta.target;
    return {
      status: HTTP.CONFLICT,
      message: `A record with this ${fields} already exists.`,
    };
  }

  return {
    status:  HTTP.SERVER_ERROR,
    message: "A database error occurred.",
  };
}

// =============================================================================
// 404 Not Found handler
// =============================================================================
/**
 * Catches requests to any route that wasn't matched by the router.
 * Must be registered AFTER all routes in server.js.
 *
 * @type {import('express').RequestHandler}
 */
function notFoundHandler(req, res) {
  return sendError(res, {
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    status:  HTTP.NOT_FOUND,
    code:    "ROUTE_NOT_FOUND",
  });
}

// =============================================================================
// Global error handler
// =============================================================================
/**
 * Central error handler. All errors from the entire application funnel here.
 * express-async-errors patches async route handlers to call next(err) on throw,
 * so we never need try/catch in controllers.
 *
 * Must have exactly 4 parameters — Express detects error middleware by arity.
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, next) {
  // ── Always log the raw error internally ─────────────────────────────────
  const logContext = {
    method:    req.method,
    path:      req.originalUrl,
    userId:    req.user?.id  || null,
    userEmail: req.user?.email || null,
    errorCode: err.code       || null,
    errorName: err.name       || null,
  };

  // ── Operational errors (thrown intentionally from service layer) ─────────
  if (err.isOperational) {
    // These are expected — log at warn, not error
    logger.warn(`[Error] Operational: ${err.message}`, logContext);

    return sendError(res, {
      message: err.message,
      status:  err.statusCode || HTTP.BAD_REQUEST,
    });
  }

  // ── Prisma / database errors ─────────────────────────────────────────────
  if (err.name === "PrismaClientKnownRequestError" || err.code?.startsWith("P")) {
    logger.error(`[Error] Prisma ${err.code}: ${err.message}`, { ...logContext, meta: err.meta });

    const { status, message } = prismaErrorDetails(err);
    return sendError(res, { message, status, code: err.code });
  }

  if (err.name === "PrismaClientValidationError") {
    logger.error(`[Error] Prisma validation: ${err.message}`, logContext);
    return sendError(res, {
      message: "Invalid data provided to the database.",
      status:  HTTP.BAD_REQUEST,
      code:    "PRISMA_VALIDATION",
    });
  }

  // ── JWT errors (shouldn't normally reach here — caught in middleware) ────
  if (err.name === "JsonWebTokenError") {
    logger.warn(`[Error] JWT: ${err.message}`, logContext);
    return sendError(res, {
      message: "Invalid authentication token.",
      status:  HTTP.UNAUTHORIZED,
      code:    "INVALID_TOKEN",
    });
  }
  if (err.name === "TokenExpiredError") {
    logger.warn(`[Error] JWT expired`, logContext);
    return sendError(res, {
      message: "Authentication token has expired.",
      status:  HTTP.UNAUTHORIZED,
      code:    "TOKEN_EXPIRED",
    });
  }

  // ── Validation errors (express-validator caught by middleware) ────────────
  if (err.name === "ValidationError") {
    logger.warn(`[Error] Validation: ${err.message}`, logContext);
    return sendError(res, {
      message: err.message,
      status:  HTTP.UNPROCESSABLE,
      code:    "VALIDATION_ERROR",
    });
  }

  // ── SyntaxError: malformed JSON body ────────────────────────────────────
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return sendError(res, {
      message: "Invalid JSON in request body.",
      status:  HTTP.BAD_REQUEST,
      code:    "INVALID_JSON",
    });
  }

  // ── Unknown / unexpected errors ──────────────────────────────────────────
  // Log everything including the stack trace for debugging
  logger.error(`[Error] Unexpected: ${err.message}`, {
    ...logContext,
    stack: err.stack,
  });

  // In development, include the stack trace in the response for easier debugging
  const responseBody = {
    message: "An unexpected internal error occurred. Our team has been notified.",
    status:  HTTP.SERVER_ERROR,
    code:    "SERVER_ERROR",
  };
  if (env.isDev) {
    responseBody.debug = { message: err.message, stack: err.stack };
  }

  return sendError(res, responseBody);
}

module.exports = { notFoundHandler, globalErrorHandler };
