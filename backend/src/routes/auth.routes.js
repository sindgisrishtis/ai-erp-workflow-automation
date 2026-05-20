"use strict";

/**
 * src/routes/auth.routes.js
 *
 * Authentication route definitions for NexusERP.
 *
 * Mounted at: /api/auth  (configured in server.js)
 *
 * Route map:
 * ─────────────────────────────────────────────────────────────────────────
 *  POST   /api/auth/register          Register a new account
 *  POST   /api/auth/login             Login with email + password
 *  POST   /api/auth/refresh           Refresh access token via cookie
 *  POST   /api/auth/logout            Clear session (requires auth)
 *  GET    /api/auth/me                Get current user profile (requires auth)
 *  PUT    /api/auth/change-password   Change password (requires auth)
 *
 * Admin-only user management (RBAC demonstration):
 *  GET    /api/auth/users             List all users        [ADMIN only]
 *  GET    /api/auth/users/:id         Get user by ID        [ADMIN or self]
 *  PATCH  /api/auth/users/:id/role    Update user role      [ADMIN only]
 *  PATCH  /api/auth/users/:id/status  Activate/deactivate   [ADMIN only]
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Middleware chain order (always followed):
 *   [rate limiter] → [validators] → [requireAuth?] → [authorizeRoles?] → controller
 */

const express = require("express");

const authController = require("../controllers/auth.controller");
const {
  requireAuth,
  authorizeRoles,
  requireSelf,
}                    = require("../middleware/auth.middleware");
const {
  registerValidators,
  loginValidators,
  refreshValidators,
  changePasswordValidators,
  handleValidationErrors,
}                    = require("../validators/auth.validator");
const { send }       = require("../utils/response");
const prisma         = require("../config/prisma");
const { USER_SELECT }= require("../middleware/auth.middleware");
const { body, param }= require("express-validator");

const router = express.Router();

// =============================================================================
// PUBLIC ROUTES  (no authentication required)
// =============================================================================

/**
 * POST /api/auth/register
 *
 * Open registration. Anyone can create an EMPLOYEE account.
 * To create ADMIN/MANAGER/FINANCE/HR accounts, use the admin route below.
 *
 * Example request:
 * POST /api/auth/register
 * {
 *   "email": "jane@company.com",
 *   "password": "SecurePass@2024",
 *   "confirmPassword": "SecurePass@2024",
 *   "firstName": "Jane",
 *   "lastName": "Smith",
 *   "department": "Engineering"
 * }
 */
router.post(
  "/register",
  registerValidators,  // Validates + calls handleValidationErrors internally
  authController.register
);

/**
 * POST /api/auth/login
 *
 * Example request:
 * POST /api/auth/login
 * {
 *   "email": "admin@nexuserp.com",
 *   "password": "NexusERP@2024"
 * }
 *
 * Example success response:
 * {
 *   "success": true,
 *   "message": "Login successful.",
 *   "data": {
 *     "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *     "user": {
 *       "id": "clxabc123",
 *       "email": "admin@nexuserp.com",
 *       "firstName": "Alex",
 *       "lastName": "Kim",
 *       "role": "ADMIN",
 *       "department": "IT"
 *     }
 *   }
 * }
 */
router.post(
  "/login",
  loginValidators,
  authController.login
);

/**
 * POST /api/auth/refresh
 *
 * The browser automatically sends the 'nexus_refresh' HttpOnly cookie
 * on requests to /api/auth/* — no body needed.
 *
 * Call this when you receive 401 "Access token has expired".
 * Store the returned accessToken in memory (React state / Zustand).
 *
 * Example response:
 * {
 *   "success": true,
 *   "message": "Token refreshed.",
 *   "data": { "accessToken": "eyJ...", "user": { ... } }
 * }
 */
router.post(
  "/refresh",
  refreshValidators,
  authController.refresh
);

// =============================================================================
// PROTECTED ROUTES  (requireAuth mandatory)
// =============================================================================

/**
 * POST /api/auth/logout
 * Clears the refresh cookie. Client should discard the access token.
 */
router.post(
  "/logout",
  requireAuth,
  authController.logout
);

/**
 * GET /api/auth/me
 * Returns the authenticated user's full profile.
 */
router.get(
  "/me",
  requireAuth,
  authController.getMe
);

/**
 * PUT /api/auth/change-password
 * Requires the current password to prevent session-hijack escalation.
 * Clears session after success — client must re-login.
 */
router.put(
  "/change-password",
  requireAuth,
  changePasswordValidators,
  authController.changePassword
);

// =============================================================================
// ADMIN-ONLY USER MANAGEMENT ROUTES
// These demonstrate authorizeRoles() and requireSelf() usage.
// In a larger project these would live in /api/users with their own module.
// =============================================================================

/**
 * GET /api/auth/users
 * List all users. ADMIN only.
 *
 * Query params:
 *   ?role=MANAGER        Filter by role
 *   ?isActive=true       Filter by active status
 *   ?page=1&limit=20     Pagination
 *
 * Example response:
 * {
 *   "success": true,
 *   "data": [ { "id": "...", "email": "...", "role": "MANAGER", ... }, ... ],
 *   "meta": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
 * }
 */
router.get(
  "/users",
  requireAuth,
  authorizeRoles("ADMIN"),
  async (req, res) => {
    const page     = Math.max(1, parseInt(req.query.page  || "1",  10));
    const limit    = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip     = (page - 1) * limit;

    // Build dynamic where clause from query params
    const where = {};
    if (req.query.role)     where.role     = req.query.role;
    if (req.query.isActive) where.isActive = req.query.isActive === "true";

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select:  USER_SELECT,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return send.paginated(res, users, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext:    page * limit < total,
      hasPrev:    page > 1,
    });
  }
);

/**
 * GET /api/auth/users/:id
 * Get a single user. ADMIN can view any user; others can only view themselves.
 */
router.get(
  "/users/:id",
  requireAuth,
  requireSelf,   // Allows: ADMIN (any), others (only own id)
  [
    param("id").notEmpty().withMessage("User ID is required"),
    handleValidationErrors,
  ],
  async (req, res) => {
    const user = await prisma.user.findUnique({
      where:  { id: req.params.id },
      select: USER_SELECT,
    });
    if (!user) return send.notFound(res, "User not found.");
    return send.ok(res, user, "User retrieved.");
  }
);

/**
 * PATCH /api/auth/users/:id/role
 * Update a user's role. ADMIN only.
 *
 * Request body:
 * { "role": "MANAGER" }
 */
router.patch(
  "/users/:id/role",
  requireAuth,
  authorizeRoles("ADMIN"),
  [
    param("id").notEmpty().withMessage("User ID is required"),
    body("role")
      .notEmpty().withMessage("Role is required")
      .isIn(["ADMIN", "MANAGER", "FINANCE", "HR", "EMPLOYEE"])
      .withMessage("Invalid role value"),
    handleValidationErrors,
  ],
  async (req, res) => {
    // Prevent the last admin from demoting themselves
    if (req.params.id === req.user.id && req.body.role !== "ADMIN") {
      return send.badRequest(res, "You cannot change your own admin role.");
    }

    const user = await prisma.user.update({
      where:  { id: req.params.id },
      data:   { role: req.body.role },
      select: USER_SELECT,
    });

    return send.ok(res, user, `User role updated to ${req.body.role}.`);
  }
);

/**
 * PATCH /api/auth/users/:id/status
 * Activate or deactivate a user account. ADMIN only.
 *
 * Request body:
 * { "isActive": false }
 */
router.patch(
  "/users/:id/status",
  requireAuth,
  authorizeRoles("ADMIN"),
  [
    param("id").notEmpty().withMessage("User ID is required"),
    body("isActive")
      .notEmpty().withMessage("isActive is required")
      .isBoolean().withMessage("isActive must be true or false"),
    handleValidationErrors,
  ],
  async (req, res) => {
    // Prevent admin from deactivating their own account
    if (req.params.id === req.user.id) {
      return send.badRequest(res, "You cannot deactivate your own account.");
    }

    const user = await prisma.user.update({
      where:  { id: req.params.id },
      data:   { isActive: req.body.isActive },
      select: USER_SELECT,
    });

    const action = req.body.isActive ? "activated" : "deactivated";
    return send.ok(res, user, `User account ${action} successfully.`);
  }
);

module.exports = router;
