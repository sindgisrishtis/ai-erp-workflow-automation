/**
 * src/utils/response.js
 *
 * Standardized API response envelope.
 *
 * Every response from the NexusERP API follows this shape:
 *
 * Success:
 * {
 *   success: true,
 *   message: "Human-readable message",
 *   data: { ... },          // payload
 *   meta: { ... }           // optional pagination / extra metadata
 * }
 *
 * Error:
 * {
 *   success: false,
 *   message: "Human-readable error",
 *   errors: [ ... ],        // optional field-level validation errors
 *   code: "ERROR_CODE"      // optional machine-readable code
 * }
 */

"use strict";

// ─── HTTP Status Codes (semantic aliases) ─────────────────────────────────────

const HTTP = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  SERVER_ERROR: 500,
};

// ─── Response builders ────────────────────────────────────────────────────────

/**
 * Send a successful response.
 *
 * @param {import('express').Response} res
 * @param {object} options
 * @param {any}    options.data     - Response payload
 * @param {string} options.message  - Success message
 * @param {number} options.status   - HTTP status code (default 200)
 * @param {object} options.meta     - Optional metadata (pagination etc.)
 */
function sendSuccess(res, { data = null, message = "Success", status = HTTP.OK, meta = null } = {}) {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  if (meta !== null) body.meta = meta;
  return res.status(status).json(body);
}

/**
 * Send a created (201) response.
 */
function sendCreated(res, { data = null, message = "Resource created successfully", meta = null } = {}) {
  return sendSuccess(res, { data, message, status: HTTP.CREATED, meta });
}

/**
 * Send an error response.
 *
 * @param {import('express').Response} res
 * @param {object} options
 * @param {string}   options.message  - Error message
 * @param {number}   options.status   - HTTP status code (default 500)
 * @param {Array}    options.errors   - Field-level validation errors
 * @param {string}   options.code     - Machine-readable error code
 */
function sendError(res, { message = "An error occurred", status = HTTP.SERVER_ERROR, errors = null, code = null } = {}) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  if (code)   body.code = code;
  return res.status(status).json(body);
}

/**
 * Shorthand error responses for common cases.
 */
const send = {
  ok:            (res, data, message)   => sendSuccess(res, { data, message }),
  created:       (res, data, message)   => sendCreated(res, { data, message }),
  paginated:     (res, data, meta, msg) => sendSuccess(res, { data, message: msg || "Success", meta }),
  badRequest:    (res, message, errors) => sendError(res, { message, status: HTTP.BAD_REQUEST, errors }),
  unauthorized:  (res, message)         => sendError(res, { message: message || "Authentication required", status: HTTP.UNAUTHORIZED, code: "UNAUTHORIZED" }),
  forbidden:     (res, message)         => sendError(res, { message: message || "Insufficient permissions", status: HTTP.FORBIDDEN, code: "FORBIDDEN" }),
  notFound:      (res, message)         => sendError(res, { message: message || "Resource not found", status: HTTP.NOT_FOUND, code: "NOT_FOUND" }),
  conflict:      (res, message)         => sendError(res, { message, status: HTTP.CONFLICT, code: "CONFLICT" }),
  validation:    (res, errors)          => sendError(res, { message: "Validation failed", status: HTTP.UNPROCESSABLE, errors, code: "VALIDATION_ERROR" }),
  tooMany:       (res)                  => sendError(res, { message: "Too many requests. Please slow down.", status: HTTP.TOO_MANY_REQUESTS, code: "RATE_LIMITED" }),
  serverError:   (res, message)         => sendError(res, { message: message || "Internal server error", status: HTTP.SERVER_ERROR, code: "SERVER_ERROR" }),
};

/**
 * Build a pagination meta object from Prisma-style pagination params.
 *
 * @param {number} total   - Total number of records
 * @param {number} page    - Current page (1-indexed)
 * @param {number} limit   - Page size
 */
function buildPaginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}

module.exports = { sendSuccess, sendCreated, sendError, send, buildPaginationMeta, HTTP };