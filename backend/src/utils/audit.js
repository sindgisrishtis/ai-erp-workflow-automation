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
 * @param {string}        params.action
 * @param {string}        params.entity
 * @param {string}        [params.entityId]
 * @param {string}        [params.detail]
 * @param {string}        [params.userId]
 * @param {string}        [params.ipAddress]
 * @param {string}        [params.userAgent]
 * @param {object}        [params.metadata]
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
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.connection?.remoteAddress || "unknown";
}

/**
 * Build standard audit context from Express request.
 *
 * @param {import("express").Request} req
 * @returns {{
 *   userId: string|null,
 *   ipAddress: string,
 *   userAgent: string
 * }}
 */
function getAuditContext(req) {
  return {
    userId: req.user?.id || null,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] || "unknown",
  };
}

/**
 * Backward-compatible alias.
 * Some modules import extractAuditContext().
 */
function extractAuditContext(req) {
  return getAuditContext(req);
}

module.exports = {
  writeAuditLog,
  getClientIp,
  getAuditContext,
  extractAuditContext,
};