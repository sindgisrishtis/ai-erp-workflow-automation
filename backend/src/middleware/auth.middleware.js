"use strict";

/**
 * src/middleware/auth.middleware.js
 *
 * Three middleware functions that handle every authentication and
 * authorization concern in the NexusERP request pipeline:
 *
 *   requireAuth     → Mandatory JWT check. Attaches req.user. Rejects 401.
 *   optionalAuth    → Best-effort JWT check. Attaches req.user if valid.
 *                     Never rejects — lets the route decide what to do.
 *   authorizeRoles  → Role-based access control (RBAC) guard.
 *                     Must be chained AFTER requireAuth.
 *
 * Usage examples:
 *
 *   // Authenticated users only
 *   router.get("/me", requireAuth, controller.getMe);
 *
 *   // Authenticated + specific roles
 *   router.post("/approve", requireAuth, authorizeRoles("ADMIN","MANAGER"), controller.approve);
 *
 *   // Public route, but attach user context if token present
 *   router.get("/feed", optionalAuth, controller.getFeed);
 */

const { verifyAccessToken, extractBearerToken } = require("../utils/jwt");
const { send }                                  = require("../utils/response");
const { writeAuditLog, getAuditContext }        = require("../utils/audit");
const prisma                                    = require("../config/prisma");
const logger                                    = require("../config/logger");

// ─── Valid roles from the Prisma schema enum ──────────────────────────────────
const VALID_ROLES = ["ADMIN", "MANAGER", "FINANCE", "HR", "EMPLOYEE"];

// ─── Safe user projection ─────────────────────────────────────────────────────
// Fields selected when we hydrate the user from the DB on each request.
// passwordHash is explicitly excluded — it must never reach req.user.
const USER_SELECT = {
  id:          true,
  email:       true,
  firstName:   true,
  lastName:    true,
  role:        true,
  department:  true,
  avatarUrl:   true,
  isActive:    true,
  lastLoginAt: true,
  createdAt:   true,
};

// =============================================================================
// requireAuth
// =============================================================================
/**
 * Mandatory authentication middleware.
 *
 * Pipeline:
 *  1. Extract Bearer token from Authorization header.
 *  2. Verify signature and expiry with JWT_ACCESS_SECRET.
 *  3. Load the full user record from PostgreSQL (ensures account is still active).
 *  4. Attach the user to req.user and proceed.
 *
 * Fails with 401 if:
 *  - No Authorization header
 *  - Token is malformed, expired, or has wrong type
 *  - User no longer exists in the database
 *  - Account is deactivated (isActive = false)
 *
 * @type {import('express').RequestHandler}
 */
async function requireAuth(req, res, next) {
  try {
    // ── Step 1: Extract token ────────────────────────────────────────────────
    const token = extractBearerToken(req);
    if (!token) {
      return send.unauthorized(res, "No authentication token provided. Include 'Authorization: Bearer <token>' header.");
    }

    // ── Step 2: Verify token signature and claims ────────────────────────────
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (jwtErr) {
      // Distinguish between expired and genuinely invalid tokens —
      // expired tokens are common and expected (client should refresh).
      if (jwtErr.name === "TokenExpiredError") {
        return send.unauthorized(res, "Access token has expired. Please refresh your session.");
      }
      // All other JWT errors (wrong secret, malformed, invalid audience)
      return send.unauthorized(res, "Invalid authentication token.");
    }

    // Confirm this is actually an access token, not a refresh token being
    // replayed against a protected endpoint.
    if (payload.type !== "access") {
      return send.unauthorized(res, "Invalid token type. Access token required.");
    }

    // ── Step 3: Hydrate user from database ───────────────────────────────────
    // We always hit the DB so that deactivated accounts are rejected immediately,
    // even if their token has not yet expired. The cost is one indexed PK lookup —
    // acceptable for enterprise auth where correctness matters most.
    const user = await prisma.user.findUnique({
      where:  { id: payload.sub },
      select: USER_SELECT,
    });

    if (!user) {
      // Token references a user that no longer exists
      return send.unauthorized(res, "User account not found.");
    }

    if (!user.isActive) {
      // Account has been deactivated by an admin
      await writeAuditLog({
        action:   "LOGIN",
        entity:   "auth",
        detail:   `Rejected request from deactivated account: ${user.email}`,
        userId:   user.id,
        ...getAuditContext(req),
      });
      return send.unauthorized(res, "Your account has been deactivated. Please contact an administrator.");
    }

    // ── Step 4: Attach to request ────────────────────────────────────────────
    req.user = user;

    logger.debug(`[Auth] Authenticated: ${user.email} (${user.role})`);
    next();

  } catch (err) {
    // Unexpected server error — log it but don't leak details to the client
    logger.error("[Auth] requireAuth unexpected error:", { error: err.message, stack: err.stack });
    return send.serverError(res, "Authentication service error.");
  }
}

// =============================================================================
// optionalAuth
// =============================================================================
/**
 * Optional (best-effort) authentication middleware.
 *
 * Tries to authenticate the request exactly like requireAuth, but:
 *  - If no token is present → continues with req.user = null
 *  - If the token is expired or invalid → continues with req.user = null
 *  - Only attaches req.user when the token is fully valid AND the user
 *    exists and is active
 *
 * Use for routes that serve different content to authenticated vs
 * anonymous visitors (e.g. public analytics, product listings).
 *
 * @type {import('express').RequestHandler}
 */
async function optionalAuth(req, res, next) {
  req.user = null; // Guarantee the property always exists downstream

  try {
    const token = extractBearerToken(req);
    if (!token) return next(); // No token → anonymous request, continue

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return next(); // Invalid/expired token → treat as anonymous
    }

    if (payload.type !== "access") return next();

    const user = await prisma.user.findUnique({
      where:  { id: payload.sub },
      select: USER_SELECT,
    });

    if (user && user.isActive) {
      req.user = user;
    }

    next();

  } catch (err) {
    // Never fail the request for optional auth errors
    logger.warn("[Auth] optionalAuth non-fatal error:", { error: err.message });
    next();
  }
}

// =============================================================================
// authorizeRoles
// =============================================================================
/**
 * Role-Based Access Control (RBAC) middleware factory.
 *
 * Returns a middleware that only allows users whose role is in the
 * provided list. Must be chained AFTER requireAuth (relies on req.user).
 *
 * @param {...string} roles - Allowed role strings (from the Role enum)
 * @returns {import('express').RequestHandler}
 *
 * @example
 *   // Allow only ADMIN and MANAGER
 *   router.delete("/users/:id", requireAuth, authorizeRoles("ADMIN"), handler);
 *
 *   // Allow ADMIN, MANAGER, and FINANCE
 *   router.get("/reports", requireAuth, authorizeRoles("ADMIN","MANAGER","FINANCE"), handler);
 */
function authorizeRoles(...roles) {
  // Validate at startup — catch typos during development, not at runtime
  roles.forEach((role) => {
    if (!VALID_ROLES.includes(role)) {
      throw new Error(
        `[Auth] authorizeRoles received unknown role: "${role}". ` +
        `Valid roles are: ${VALID_ROLES.join(", ")}`
      );
    }
  });

  return async function roleGuard(req, res, next) {
    // requireAuth must run first to populate req.user
    if (!req.user) {
      return send.unauthorized(res, "Authentication required before role check.");
    }

    if (!roles.includes(req.user.role)) {
      // Log the failed authorization attempt for security auditing
      logger.warn("[Auth] Authorization denied", {
        userId:       req.user.id,
        userRole:     req.user.role,
        requiredRoles: roles,
        path:         req.originalUrl,
        method:       req.method,
      });

      await writeAuditLog({
        action:   "LOGIN", // closest available action — means "attempted access"
        entity:   "auth",
        detail:   `Authorization denied: role ${req.user.role} attempted ${req.method} ${req.path} (requires: ${roles.join("|")})`,
        userId:   req.user.id,
        ...getAuditContext(req),
      });

      return send.forbidden(
        res,
        `Access denied. This action requires one of the following roles: ${roles.join(", ")}.`
      );
    }

    next();
  };
}

// =============================================================================
// requireSelf
// =============================================================================
/**
 * Ensures the authenticated user is either:
 *  (a) accessing their own resource (req.params.id === req.user.id), OR
 *  (b) has the ADMIN role (can always access any user's data)
 *
 * Use for endpoints like GET /users/:id or PUT /users/:id/profile.
 *
 * @type {import('express').RequestHandler}
 */
function requireSelf(req, res, next) {
  if (!req.user) {
    return send.unauthorized(res);
  }

  const isOwner = req.params.id === req.user.id;
  const isAdmin = req.user.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    return send.forbidden(res, "You can only access your own resources.");
  }

  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  authorizeRoles,
  requireSelf,
  USER_SELECT, // Exported for reuse in other services that need the same projection
};
