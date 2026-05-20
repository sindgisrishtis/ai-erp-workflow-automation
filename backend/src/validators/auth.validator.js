/**
 * src/validators/auth.validator.js
 *
 * Request validation rules for all auth endpoints using express-validator.
 *
 * These run BEFORE the controller, ensuring controllers always receive
 * clean, validated data. Invalid requests are rejected at the boundary
 * with descriptive error messages — before any business logic executes.
 */

"use strict";

const { body, validationResult } = require("express-validator");
const { send } = require("../utils/response");

// ─── Validation result handler ────────────────────────────────────────────────

/**
 * Middleware that checks if any previous validators reported errors.
 * Place this AFTER the validation rule arrays in your route definition.
 *
 * If validation passes, calls next().
 * If validation fails, returns a 422 with structured error details.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
      value: err.value,
    }));
    return send.validation(res, formatted);
  }
  next();
}

// ─── Reusable field validators ────────────────────────────────────────────────

const emailField = (field = "email") =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage("Email must not exceed 255 characters");

const passwordField = (field = "password") =>
  body(field)
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .isLength({ max: 128 })
    .withMessage("Password must not exceed 128 characters");

const nameField = (field, label) =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage(`${label} is required`)
    .isLength({ min: 2, max: 50 })
    .withMessage(`${label} must be between 2 and 50 characters`)
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage(`${label} contains invalid characters`);

// ─── Validator chains per endpoint ────────────────────────────────────────────

/**
 * POST /api/auth/register
 */
const registerValidators = [
  emailField(),

  passwordField()
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/).withMessage("Password must contain at least one lowercase letter")
    .matches(/\d/).withMessage("Password must contain at least one number")
    .matches(/[^A-Za-z0-9]/).withMessage("Password must contain at least one special character"),

  body("confirmPassword")
    .notEmpty()
    .withMessage("Please confirm your password")
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),

  nameField("firstName", "First name"),
  nameField("lastName", "Last name"),

  body("role")
    .optional()
    .isIn(["ADMIN", "MANAGER", "FINANCE", "HR", "EMPLOYEE"])
    .withMessage("Invalid role. Must be one of: ADMIN, MANAGER, FINANCE, HR, EMPLOYEE"),

  body("department")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Department must not exceed 100 characters"),

  handleValidationErrors,
];

/**
 * POST /api/auth/login
 */
const loginValidators = [
  emailField(),

  body("password")
    .notEmpty()
    .withMessage("Password is required"),

  body("rememberMe")
    .optional()
    .isBoolean()
    .withMessage("rememberMe must be a boolean"),

  handleValidationErrors,
];

/**
 * POST /api/auth/refresh
 * (refresh token comes from the HttpOnly cookie — no body validation needed,
 *  but we keep the middleware chain consistent)
 */
const refreshValidators = [handleValidationErrors];

/**
 * POST /api/auth/change-password
 */
const changePasswordValidators = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),

  passwordField("newPassword")
    .matches(/[A-Z]/).withMessage("New password must contain at least one uppercase letter")
    .matches(/[a-z]/).withMessage("New password must contain at least one lowercase letter")
    .matches(/\d/).withMessage("New password must contain at least one number")
    .matches(/[^A-Za-z0-9]/).withMessage("New password must contain at least one special character"),

  body("confirmNewPassword")
    .notEmpty()
    .withMessage("Please confirm your new password")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("New passwords do not match");
      }
      return true;
    }),

  handleValidationErrors,
];

module.exports = {
  registerValidators,
  loginValidators,
  refreshValidators,
  changePasswordValidators,
  handleValidationErrors,
};