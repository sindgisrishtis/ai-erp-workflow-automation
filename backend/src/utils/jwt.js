/**
 * src/utils/jwt.js
 *
 * JWT utility functions for NexusERP.
 *
 * Strategy:
 *  - Short-lived ACCESS tokens (15m default) sent in the Authorization header.
 *    Stateless — validated purely by signature verification.
 *
 *  - Long-lived REFRESH tokens (7d default) stored in an HttpOnly cookie.
 *    Used only at POST /api/auth/refresh to issue a new access token.
 *    Longer-lived but confined to a single endpoint, minimizing attack surface.
 *
 * Payload shape:
 * {
 *   sub:  string   // user.id  (standard JWT "subject")
 *   email: string
 *   role: string   // Role enum value
 *   type: "access" | "refresh"
 * }
 */

"use strict";

const jwt = require("jsonwebtoken");
const env = require("../config/env");
const logger = require("../config/logger");

// ─── Token generation ─────────────────────────────────────────────────────────

/**
 * Sign a JWT access token for the given user.
 *
 * @param {{ id: string, email: string, role: string }} user
 * @returns {string} Signed JWT string
 */
function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: "access",
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      issuer: "nexuserp",
      audience: "nexuserp-client",
    }
  );
}

/**
 * Sign a JWT refresh token for the given user.
 *
 * @param {{ id: string, email: string, role: string }} user
 * @returns {string} Signed JWT string
 */
function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: "refresh",
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      issuer: "nexuserp",
      audience: "nexuserp-client",
    }
  );
}

/**
 * Generate both access and refresh tokens in one call.
 *
 * @param {{ id: string, email: string, role: string }} user
 * @returns {{ accessToken: string, refreshToken: string }}
 */
function generateTokenPair(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

// ─── Token verification ───────────────────────────────────────────────────────

/**
 * Verify and decode a JWT access token.
 *
 * @param {string} token
 * @returns {{ sub: string, email: string, role: string, type: string, iat: number, exp: number }}
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "nexuserp",
    audience: "nexuserp-client",
  });
}

/**
 * Verify and decode a JWT refresh token.
 *
 * @param {string} token
 * @returns {{ sub: string, email: string, role: string, type: string }}
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: "nexuserp",
    audience: "nexuserp-client",
  });
}

/**
 * Decode a JWT *without* verifying its signature.
 * Useful for extracting claims from expired tokens (e.g. for logging).
 * Do NOT use this for authorization decisions.
 *
 * @param {string} token
 * @returns {object | null}
 */
function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

/**
 * Shared options for the refresh-token HttpOnly cookie.
 * The cookie is scoped to /api/auth so it is ONLY sent to the refresh endpoint.
 */
function getRefreshCookieOptions() {
  return {
    httpOnly: true,                       // Not accessible via document.cookie
    secure: env.COOKIE_SECURE,           // HTTPS only in production
    sameSite: env.COOKIE_SAME_SITE,      // CSRF protection
    path: "/api/auth",                   // Scoped — only sent to auth routes
    maxAge: 7 * 24 * 60 * 60 * 1000,    // 7 days in milliseconds
  };
}

/**
 * Set the refresh token as a scoped HttpOnly cookie.
 *
 * @param {import('express').Response} res
 * @param {string} refreshToken
 */
function setRefreshCookie(res, refreshToken) {
  res.cookie("nexus_refresh", refreshToken, getRefreshCookieOptions());
}

/**
 * Clear the refresh token cookie (on logout).
 *
 * @param {import('express').Response} res
 */
function clearRefreshCookie(res) {
  res.clearCookie("nexus_refresh", {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/auth",
  });
}

// ─── Token extraction helpers ─────────────────────────────────────────────────

/**
 * Extract a Bearer token from the Authorization header.
 * Returns null if the header is absent or malformed.
 *
 * @param {import('express').Request} req
 * @returns {string | null}
 */
function extractBearerToken(req) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

/**
 * Calculate seconds until a JWT expires.
 * Returns 0 if the token has already expired.
 *
 * @param {string} token
 * @returns {number}
 */
function getTokenTTL(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded?.exp) return 0;
    return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
  } catch {
    return 0;
  }
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshCookieOptions,
  extractBearerToken,
  getTokenTTL,
};