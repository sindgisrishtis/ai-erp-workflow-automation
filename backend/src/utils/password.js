/**
 * src/utils/password.js
 *
 * Password hashing and verification utilities using bcrypt.
 *
 * bcrypt is intentionally slow (work factor / cost determines how slow),
 * making brute-force attacks computationally expensive.
 *
 * Cost factor 12 benchmarks at ~250ms per hash on modern hardware —
 * imperceptible to users, but turns an attacker's GPU into a space heater.
 */

"use strict";

const bcrypt = require("bcrypt");

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * bcrypt cost factor (salt rounds).
 * 10 = ~65ms  (acceptable minimum)
 * 12 = ~250ms (recommended for most apps)
 * 14 = ~1s    (for very sensitive data — login becomes slow)
 *
 * Increase as servers get faster over time.
 */
const SALT_ROUNDS = 12;

/**
 * Common passwords and patterns that should be rejected outright.
 * This is a minimal list — a full implementation would use haveibeenpwned.com API.
 */
const BLOCKED_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789",
  "qwerty123", "letmein1", "welcome1", "admin1234", "iloveyou",
  "nexuserp", "nexuserp1", "nexuserp123",
]);

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Hash a plain-text password using bcrypt.
 *
 * @param {string} plainPassword  - The raw password from the user
 * @returns {Promise<string>}     - bcrypt hash string
 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * Compare a plain-text password against a stored bcrypt hash.
 * Uses bcrypt's timing-safe comparison to prevent timing attacks.
 *
 * @param {string} plainPassword  - The raw password to check
 * @param {string} hash           - The stored bcrypt hash
 * @returns {Promise<boolean>}    - true if the password matches
 */
async function verifyPassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate password strength and return a human-readable error message,
 * or null if the password meets all requirements.
 *
 * Rules:
 *  - Minimum 8 characters
 *  - At least one uppercase letter
 *  - At least one lowercase letter
 *  - At least one digit
 *  - At least one special character
 *  - Not a known-common password
 *
 * @param {string} password
 * @returns {string | null} Error message, or null if valid
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== "string") {
    return "Password is required.";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (password.length > 128) {
    return "Password must not exceed 128 characters.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one number.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain at least one special character (e.g. @, #, !, $).";
  }
  if (BLOCKED_PASSWORDS.has(password.toLowerCase())) {
    return "This password is too common. Please choose a stronger password.";
  }
  return null; // All checks passed
}

/**
 * Check bcrypt cost factor on an existing hash.
 * Useful for detecting hashes that need to be re-hashed with a higher cost.
 *
 * @param {string} hash   - Existing bcrypt hash
 * @returns {number}      - Cost factor used when the hash was created
 */
function getHashCost(hash) {
  return bcrypt.getRounds(hash);
}

/**
 * Determine if a stored hash needs to be re-hashed with the current cost factor.
 * Call this after a successful login and re-hash if true.
 *
 * @param {string} hash
 * @returns {boolean}
 */
function needsRehash(hash) {
  return getHashCost(hash) < SALT_ROUNDS;
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  getHashCost,
  needsRehash,
  SALT_ROUNDS,
};