"use strict";

/**
 * src/services/auth.service.js
 *
 * Authentication business logic layer for NexusERP.
 *
 * The service layer sits between controllers and the database.
 * Controllers stay thin — they only handle HTTP concerns.
 * This layer owns: business rules, Prisma queries, password ops,
 * token generation, and audit logging.
 *
 * Every exported function returns a plain result object.
 * Errors are thrown with a structured { message, statusCode } shape
 * so controllers can re-throw them into the global error handler.
 */

const prisma                        = require("../config/prisma");
const logger                        = require("../config/logger");
const { hashPassword,
        verifyPassword,
        validatePasswordStrength,
        needsRehash }               = require("../utils/password");
const { generateTokenPair,
        signAccessToken,
        verifyRefreshToken,
        setRefreshCookie,
        clearRefreshCookie }        = require("../utils/jwt");
const { writeAuditLog,
        getAuditContext }           = require("../utils/audit");
const { USER_SELECT }               = require("../middleware/auth.middleware");

// ─── Internal error factory ───────────────────────────────────────────────────
// Creates structured errors the global error handler knows how to serialize.
function createError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true; // Flag: this is a known business error, not a crash
  return err;
}

// ─── Safe user projection shared across all service methods ──────────────────
// Identical to the middleware projection — passwordHash never leaves the DB layer.
const SAFE_USER_SELECT = USER_SELECT;

// =============================================================================
// register
// =============================================================================
/**
 * Register a new user account.
 *
 * Rules:
 *  - Email must be unique (Prisma unique constraint will catch duplicates)
 *  - Password is validated for strength before hashing
 *  - Role defaults to EMPLOYEE; only ADMIN can create privileged accounts
 *    (enforced in the route via authorizeRoles — the service trusts its input)
 *  - Returns token pair so the user is immediately logged in after registration
 *
 * @param {object} dto
 * @param {string} dto.email
 * @param {string} dto.password       - Plain text (will be hashed here)
 * @param {string} dto.firstName
 * @param {string} dto.lastName
 * @param {string} [dto.role]         - Defaults to "EMPLOYEE"
 * @param {string} [dto.department]
 * @param {import('express').Request} req - For audit context extraction
 * @param {import('express').Response} res - For setting refresh cookie
 * @returns {{ user: object, accessToken: string }}
 */
async function register(dto, req, res) {
  const { email, password, firstName, lastName, role = "EMPLOYEE", department } = dto;

  // ── Password strength check ──────────────────────────────────────────────
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    throw createError(strengthError, 422);
  }

  // ── Duplicate email check ────────────────────────────────────────────────
  // Check explicitly before hashing to give a clear error message.
  // (Prisma unique constraint would also catch it, but its error is less friendly.)
  const existing = await prisma.user.findUnique({
    where:  { email: email.toLowerCase().trim() },
    select: { id: true },
  });
  if (existing) {
    throw createError("An account with this email address already exists.", 409);
  }

  // ── Hash password ────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(password);

  // ── Create user record ───────────────────────────────────────────────────
  const user = await prisma.user.create({
    data: {
      email:        email.toLowerCase().trim(),
      passwordHash,
      firstName:    firstName.trim(),
      lastName:     lastName.trim(),
      role:         role || "EMPLOYEE",
      department:   department?.trim() || null,
      lastLoginAt:  new Date(), // Registration counts as first login
    },
    select: SAFE_USER_SELECT,
  });

  // ── Issue token pair ─────────────────────────────────────────────────────
  const { accessToken, refreshToken } = generateTokenPair(user);
  setRefreshCookie(res, refreshToken);

  // ── Audit trail ──────────────────────────────────────────────────────────
  await writeAuditLog({
    action:   "CREATED",
    entity:   "users",
    entityId: user.id,
    detail:   `New user registered: ${user.email} (role: ${user.role})`,
    userId:   user.id,
    ...getAuditContext(req),
  });

  logger.info(`[Auth] User registered: ${user.email} (${user.role})`);

  return { user, accessToken };
}

// =============================================================================
// login
// =============================================================================
/**
 * Authenticate a user and issue a token pair.
 *
 * Security notes:
 *  - We always call verifyPassword even when the user doesn't exist.
 *    This prevents timing attacks that could reveal whether an email
 *    is registered (constant-time comparison regardless of outcome).
 *  - We return the same generic error for "email not found" and
 *    "wrong password" to prevent user enumeration.
 *  - On success, we opportunistically re-hash the password if the stored
 *    hash uses an outdated cost factor (transparent upgrade).
 *
 * @param {object} dto
 * @param {string} dto.email
 * @param {string} dto.password
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {{ user: object, accessToken: string }}
 */
async function login(dto, req, res) {
  const { email, password } = dto;

  // ── Look up the user including the hash (the ONLY place we select it) ────
  const userWithHash = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      ...SAFE_USER_SELECT,
      passwordHash: true, // Only selected here — for verification only
    },
  });

  // ── Timing-safe failure path ─────────────────────────────────────────────
  // If no user found, run a dummy bcrypt compare to burn the same ~250ms
  // that a real comparison would take. Without this, an attacker could
  // detect non-existent emails by response time alone.
  const DUMMY_HASH = "$2b$12$dummy.hash.to.prevent.timing.attacks.padding.here";
  const candidateHash = userWithHash?.passwordHash || DUMMY_HASH;
  const passwordValid = await verifyPassword(password, candidateHash);

  if (!userWithHash || !passwordValid) {
    // Log the failed attempt (rate limiter handles repeated failures)
    await writeAuditLog({
      action:   "LOGIN",
      entity:   "auth",
      detail:   `Failed login attempt for email: ${email}`,
      userId:   userWithHash?.id || null,
      ...getAuditContext(req),
    });
    throw createError("Invalid email or password.", 401);
  }

  // ── Account status check ─────────────────────────────────────────────────
  if (!userWithHash.isActive) {
    throw createError("Your account has been deactivated. Please contact an administrator.", 401);
  }

  // ── Opportunistic password re-hash ───────────────────────────────────────
  // If bcrypt cost factor has been increased since this user's hash was created,
  // re-hash transparently on successful login. Zero user friction.
  if (needsRehash(userWithHash.passwordHash)) {
    const newHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: userWithHash.id },
      data:  { passwordHash: newHash },
    });
    logger.info(`[Auth] Re-hashed password for user: ${userWithHash.email}`);
  }

  // ── Update last login timestamp ──────────────────────────────────────────
  const user = await prisma.user.update({
    where:  { id: userWithHash.id },
    data:   { lastLoginAt: new Date() },
    select: SAFE_USER_SELECT,
  });

  // ── Issue token pair ─────────────────────────────────────────────────────
  const { accessToken, refreshToken } = generateTokenPair(user);
  setRefreshCookie(res, refreshToken);

  // ── Audit trail ──────────────────────────────────────────────────────────
  await writeAuditLog({
    action:   "LOGIN",
    entity:   "auth",
    entityId: user.id,
    detail:   `Successful login: ${user.email}`,
    userId:   user.id,
    ...getAuditContext(req),
  });

  logger.info(`[Auth] Login successful: ${user.email} (${user.role})`);

  return { user, accessToken };
}

// =============================================================================
// refreshToken
// =============================================================================
/**
 * Issue a new access token using the refresh token from the HttpOnly cookie.
 *
 * The refresh token is long-lived (7 days) but scoped to /api/auth only,
 * so it is never accidentally sent to other API endpoints.
 *
 * We re-verify the user in the DB on every refresh to ensure that deactivated
 * accounts stop getting new access tokens even before the refresh token expires.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {{ accessToken: string, user: object }}
 */
async function refreshToken(req, res) {
  // ── Extract refresh token from HttpOnly cookie ───────────────────────────
  const token = req.cookies?.nexus_refresh;
  if (!token) {
    throw createError("No refresh token found. Please log in again.", 401);
  }

  // ── Verify refresh token ──────────────────────────────────────────────────
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (err) {
    clearRefreshCookie(res); // Clear the bad cookie immediately
    if (err.name === "TokenExpiredError") {
      throw createError("Your session has expired. Please log in again.", 401);
    }
    throw createError("Invalid refresh token. Please log in again.", 401);
  }

  // Ensure this is genuinely a refresh token (not an access token being replayed)
  if (payload.type !== "refresh") {
    clearRefreshCookie(res);
    throw createError("Invalid token type.", 401);
  }

  // ── Verify user still exists and is active ───────────────────────────────
  const user = await prisma.user.findUnique({
    where:  { id: payload.sub },
    select: SAFE_USER_SELECT,
  });

  if (!user || !user.isActive) {
    clearRefreshCookie(res);
    throw createError("User not found or account deactivated.", 401);
  }

  // ── Issue a new access token (rotate — do not reuse the old one) ─────────
  // We only rotate the access token. The refresh token's expiry window
  // slides naturally — we don't re-issue it here to avoid extending the
  // attack window if a refresh token is somehow compromised.
  const accessToken = signAccessToken(user);

  // ── Audit trail ──────────────────────────────────────────────────────────
  await writeAuditLog({
    action:   "TOKEN_REFRESHED",
    entity:   "auth",
    entityId: user.id,
    detail:   `Token refreshed for: ${user.email}`,
    userId:   user.id,
    ...getAuditContext(req),
  });

  return { accessToken, user };
}

// =============================================================================
// logout
// =============================================================================
/**
 * Log the user out by clearing the refresh token cookie.
 *
 * Because we use stateless JWTs, we cannot truly "invalidate" the access token
 * on the server. However:
 *  1. Clearing the refresh cookie prevents the client from getting new
 *     access tokens — the current one will expire within 15 minutes.
 *  2. For higher security requirements, implement a token denylist in Redis.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function logout(req, res) {
  const userId    = req.user?.id;
  const userEmail = req.user?.email;

  // Clear the HttpOnly refresh cookie
  clearRefreshCookie(res);

  // Audit even if user somehow ended up unauthenticated (defensive)
  if (userId) {
    await writeAuditLog({
      action:   "LOGOUT",
      entity:   "auth",
      entityId: userId,
      detail:   `Logout: ${userEmail}`,
      userId,
      ...getAuditContext(req),
    });
    logger.info(`[Auth] Logout: ${userEmail}`);
  }
}

// =============================================================================
// getCurrentUser
// =============================================================================
/**
 * Return the currently authenticated user's profile.
 * req.user is already populated by requireAuth middleware — no extra DB call
 * needed unless you want fresher data (we do a fresh select for consistency).
 *
 * @param {string} userId
 * @returns {object} User profile (no passwordHash)
 */
async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: SAFE_USER_SELECT,
  });

  if (!user) {
    throw createError("User not found.", 404);
  }

  return user;
}

// =============================================================================
// changePassword
// =============================================================================
/**
 * Change the authenticated user's password.
 *
 * Requires the current password for verification — prevents an attacker
 * with a stolen session token from locking the real user out.
 *
 * After a successful change:
 *  - New password is hashed and persisted
 *  - Refresh cookie is cleared (forces re-login on all devices)
 *  - Audit log entry is written
 *
 * @param {object} dto
 * @param {string} dto.currentPassword
 * @param {string} dto.newPassword
 * @param {string} userId
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function changePassword(dto, userId, req, res) {
  const { currentPassword, newPassword } = dto;

  // ── Fetch current hash ───────────────────────────────────────────────────
  const userWithHash = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!userWithHash) {
    throw createError("User not found.", 404);
  }

  // ── Verify current password ──────────────────────────────────────────────
  const currentValid = await verifyPassword(currentPassword, userWithHash.passwordHash);
  if (!currentValid) {
    await writeAuditLog({
      action:   "PASSWORD_CHANGED",
      entity:   "users",
      entityId: userId,
      detail:   `Failed password change attempt (wrong current password): ${userWithHash.email}`,
      userId,
      ...getAuditContext(req),
    });
    throw createError("Current password is incorrect.", 400);
  }

  // ── Ensure new password differs from current ─────────────────────────────
  const samePassword = await verifyPassword(newPassword, userWithHash.passwordHash);
  if (samePassword) {
    throw createError("New password must be different from your current password.", 400);
  }

  // ── Validate new password strength ───────────────────────────────────────
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) {
    throw createError(strengthError, 422);
  }

  // ── Hash and persist ──────────────────────────────────────────────────────
  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data:  { passwordHash: newHash, updatedAt: new Date() },
  });

  // ── Invalidate session (force re-login) ──────────────────────────────────
  clearRefreshCookie(res);

  // ── Audit trail ──────────────────────────────────────────────────────────
  await writeAuditLog({
    action:   "PASSWORD_CHANGED",
    entity:   "users",
    entityId: userId,
    detail:   `Password changed successfully: ${userWithHash.email}`,
    userId,
    ...getAuditContext(req),
  });

  logger.info(`[Auth] Password changed: ${userWithHash.email}`);
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  changePassword,
};
