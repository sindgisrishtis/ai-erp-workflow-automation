/**
 * src/utils/audit.js
 *
 * Centralized audit logging utility.
 *
 * Every significant action in NexusERP is recorded here:
 * logins, PO approvals, inventory changes, task updates, AI queries, etc.
 *
 * Audit logs are append-only — we never update or delete them.
 * This provides an immutable compliance trail.
 */

"use strict";

const prisma = require("../config/prisma");
const logger = require("../config/logger");

/**
 * Write an audit log entry.
 * Failures are logged but never propagate — audit logging must never
 * crash the main request flow.
 *
 * @param {object} params
 * @param {string}        params.action     - AuditAction enum value
 * @param {string}        params.entity     - Table/module name (e.g. "purchase_orders")
 * @param {string}        [params.entityId] - Primary key of the affected record
 * @param {string}        [params.detail]   - Human-readable description
 * @param {string}        [params.userId]   - Actor user ID (null for system actions)
 * @param {string}        [params.ipAddress]
 * @param {string}        [params.userAgent]
 * @param {object}        [params.metadata] - Any additional structured data
 */
async function writeAuditLog({
  action,
  entity,
  entityId = null,
  detail = null,
  userId = null,
  ipAddress = null,
  userAgent = null,
  metadata = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        detail,
        userId,
        ipAddress,
        userAgent,
        metadata,
      },
    });
  } catch (err) {
    // Audit log failures must NEVER crash the application
    logger.error("[AuditLog] Failed to write audit entry", {
      error: err.message,
      action,
      entity,
      entityId,
    });
  }
}

/**
 * Extract client IP from the request.
 * Handles proxies by checking x-forwarded-for.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; the first is the client
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || "unknown";
}

/**
 * Build standard audit context from an Express request.
 * Call this in controllers/middleware to get { userId, ipAddress, userAgent }.
 *
 * @param {import('express').Request} req
 * @returns {{ userId: string|null, ipAddress: string, userAgent: string }}
 */
function getAuditContext(req) {
  return {
    userId: req.user?.id || null,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] || "unknown",
  };
}

module.exports = { writeAuditLog, getClientIp, getAuditContext };