"use strict";

/**
 * src/controllers/auth.controller.js
 *
 * Thin HTTP layer for all authentication endpoints.
 *
 * Controller responsibilities (ONLY these — nothing more):
 *   1. Extract validated data from req.body / req.user / req.cookies
 *   2. Call the corresponding auth service method
 *   3. Send a standardized response
 *
 * All business logic, Prisma queries, password hashing, token generation,
 * and audit logging live in auth.service.js — controllers stay ignorant
 * of those details so they can be tested and swapped independently.
 *
 * Error handling:
 *   Operational errors (wrong password, duplicate email, etc.) are thrown
 *   from the service with err.isOperational = true and err.statusCode set.
 *   The global error handler in server.js catches them and formats the response.
 *   We use express-async-errors so async throws are automatically forwarded
 *   to next(err) without needing try/catch in every controller.
 */

const authService  = require("../services/auth.service");
const { send }     = require("../utils/response");

// =============================================================================
// POST /api/auth/register
// =============================================================================
/**
 * Register a new user account.
 *
 * Request body (validated by registerValidators):
 * {
 *   email:           string  — user@example.com
 *   password:        string  — min 8 chars, uppercase, digit, special char
 *   confirmPassword: string  — must match password
 *   firstName:       string
 *   lastName:        string
 *   role?:           string  — defaults to "EMPLOYEE" (ADMIN-only to set others)
 *   department?:     string
 * }
 *
 * Success 201:
 * {
 *   success: true,
 *   message: "Account created successfully.",
 *   data: {
 *     user:        { id, email, firstName, lastName, role, ... }
 *     accessToken: "eyJ..."
 *   }
 * }
 */
async function register(req, res) {
  const result = await authService.register(req.body, req, res);
  // res already has the refresh cookie set by the service
  return send.created(res, result, "Account created successfully.");
}

// =============================================================================
// POST /api/auth/login
// =============================================================================
/**
 * Authenticate with email and password.
 *
 * Request body:
 * {
 *   email:       string
 *   password:    string
 *   rememberMe?: boolean  — reserved for future extended-session logic
 * }
 *
 * Success 200:
 * {
 *   success: true,
 *   message: "Login successful.",
 *   data: {
 *     user:        { id, email, firstName, lastName, role, ... }
 *     accessToken: "eyJ..."
 *   }
 * }
 *
 * The refresh token is set as an HttpOnly cookie (not in the body).
 * Clients should store the accessToken in memory (NOT localStorage).
 */
async function login(req, res) {
  const result = await authService.login(req.body, req, res);
  return send.ok(res, result, "Login successful.");
}

// =============================================================================
// POST /api/auth/refresh
// =============================================================================
/**
 * Exchange the HttpOnly refresh cookie for a new access token.
 *
 * No request body needed — the refresh token arrives automatically
 * via the 'nexus_refresh' cookie on requests to /api/auth/*.
 *
 * Success 200:
 * {
 *   success: true,
 *   message: "Token refreshed.",
 *   data: {
 *     accessToken: "eyJ..."
 *     user: { ... }
 *   }
 * }
 *
 * Call this when the client receives a 401 with message "Access token has expired".
 */
async function refresh(req, res) {
  const result = await authService.refreshToken(req, res);
  return send.ok(res, result, "Token refreshed.");
}

// =============================================================================
// POST /api/auth/logout
// =============================================================================
/**
 * Log out the current user.
 *
 * Clears the refresh cookie. The access token expires naturally (≤15 min).
 * For immediate invalidation, implement a Redis denylist.
 *
 * No request body needed.
 *
 * Success 200:
 * {
 *   success: true,
 *   message: "Logged out successfully."
 * }
 */
async function logout(req, res) {
  await authService.logout(req, res);
  return send.ok(res, null, "Logged out successfully.");
}

// =============================================================================
// GET /api/auth/me
// =============================================================================
/**
 * Return the authenticated user's profile.
 * Protected by requireAuth — req.user is guaranteed to be populated.
 *
 * Success 200:
 * {
 *   success: true,
 *   message: "User profile retrieved.",
 *   data: {
 *     id, email, firstName, lastName, role,
 *     department, avatarUrl, isActive, lastLoginAt, createdAt
 *   }
 * }
 */
async function getMe(req, res) {
  // req.user already populated by requireAuth — fresh select in service
  const user = await authService.getCurrentUser(req.user.id);
  return send.ok(res, user, "User profile retrieved.");
}

// =============================================================================
// PUT /api/auth/change-password
// =============================================================================
/**
 * Change the authenticated user's password.
 * Protected by requireAuth.
 *
 * Request body (validated by changePasswordValidators):
 * {
 *   currentPassword:    string
 *   newPassword:        string  — same strength rules as registration
 *   confirmNewPassword: string  — must match newPassword
 * }
 *
 * Success 200:
 * {
 *   success: true,
 *   message: "Password changed successfully. Please log in again."
 * }
 *
 * After success, the refresh cookie is cleared — the client should
 * redirect to the login page.
 */
async function changePassword(req, res) {
  await authService.changePassword(req.body, req.user.id, req, res);
  return send.ok(res, null, "Password changed successfully. Please log in again.");
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  changePassword,
};
