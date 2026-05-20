"use strict";

/**
 * src/server.js
 *
 * NexusERP Express application entry point.
 *
 * Startup sequence:
 *  1. Load and validate environment variables
 *  2. Register express-async-errors (must happen before any route imports)
 *  3. Configure security middleware (helmet, cors, rate limiting)
 *  4. Mount request middleware (json, cookie-parser, morgan)
 *  5. Mount API routes
 *  6. Mount 404 and global error handlers (always last)
 *  7. Start the HTTP server
 *  8. Register process signal handlers for graceful shutdown
 */

// ── MUST be first — patches all async route handlers to forward errors ────────
require("express-async-errors");

const express        = require("express");
const helmet         = require("helmet");
const cors           = require("cors");
const morgan         = require("morgan");
const cookieParser   = require("cookie-parser");
const rateLimit      = require("express-rate-limit");

const env            = require("./config/env");
const logger         = require("./config/logger");
const prisma         = require("./config/prisma");
const { send, HTTP } = require("./utils/response");

// ── Route modules ─────────────────────────────────────────────────────────────
const authRoutes     = require("./routes/auth.routes");

// ── Error middleware (must be imported after routes) ──────────────────────────
const {
  notFoundHandler,
  globalErrorHandler,
}                    = require("./middleware/error.middleware");

// =============================================================================
// App factory
// We export createApp() so the same app instance can be used in tests
// without actually binding to a port.
// =============================================================================
function createApp() {
  const app = express();

  // ── Trust proxy (required for correct IP behind Nginx / AWS ALB) ──────────
  // Set to 1 if there is exactly one proxy in front of Express.
  // This enables req.ip to return the real client IP from x-forwarded-for.
  app.set("trust proxy", 1);

  // =========================================================================
  // SECURITY MIDDLEWARE
  // =========================================================================

  /**
   * Helmet sets security-relevant HTTP headers:
   *  - Content-Security-Policy
   *  - X-Frame-Options: DENY
   *  - X-Content-Type-Options: nosniff
   *  - Strict-Transport-Security (HSTS)
   *  - Referrer-Policy
   *  ... and more
   */
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // Disable if serving embedded content
      contentSecurityPolicy: env.isProd
        ? undefined  // Use Helmet's strict defaults in production
        : false,     // Disable in development so browser tools work
    })
  );

  /**
   * CORS — Cross-Origin Resource Sharing.
   * Allows the React frontend (localhost:5173 in dev, production domain in prod)
   * to send requests including cookies (credentials: true).
   */
  app.use(
    cors({
      origin(origin, callback) {
        // Allow requests with no origin (curl, Postman, server-to-server)
        if (!origin) return callback(null, true);

        if (env.ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }

        logger.warn(`[CORS] Blocked request from origin: ${origin}`);
        return callback(new Error(`CORS: Origin '${origin}' is not allowed.`));
      },
      credentials: true,       // Required for HttpOnly cookies to be sent
      methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
      ],
    })
  );

  // =========================================================================
  // RATE LIMITING
  // =========================================================================

  /**
   * Global rate limiter — applied to all /api/* routes.
   * Prevents brute-force, DDoS, and API abuse.
   * 100 requests per 15-minute window per IP.
   */
  const globalLimiter = rateLimit({
    windowMs:         env.RATE_LIMIT_WINDOW_MS,  // 15 minutes
    max:              env.RATE_LIMIT_MAX,         // 100 per window
    standardHeaders:  true,   // Adds RateLimit-* headers to responses
    legacyHeaders:    false,  // Suppresses X-RateLimit-* legacy headers
    message: {
      success: false,
      message: "Too many requests from this IP. Please try again in 15 minutes.",
      code:    "RATE_LIMITED",
    },
    handler(req, res) {
      logger.warn(`[RateLimit] Global limit exceeded`, { ip: req.ip, path: req.path });
      res.status(HTTP.TOO_MANY_REQUESTS).json({
        success: false,
        message: "Too many requests. Please slow down.",
        code:    "RATE_LIMITED",
      });
    },
  });

  /**
   * Strict auth rate limiter — applied only to login/register.
   * 10 requests per 15 minutes prevents credential brute-forcing.
   */
  const authLimiter = rateLimit({
    windowMs:        env.RATE_LIMIT_WINDOW_MS,
    max:             env.AUTH_RATE_LIMIT_MAX,     // 10 per window
    standardHeaders: true,
    legacyHeaders:   false,
    skipSuccessfulRequests: true,  // Only count failed attempts
    handler(req, res) {
      logger.warn(`[RateLimit] Auth limit exceeded`, { ip: req.ip, path: req.path });
      res.status(HTTP.TOO_MANY_REQUESTS).json({
        success: false,
        message: "Too many authentication attempts. Please wait 15 minutes before trying again.",
        code:    "AUTH_RATE_LIMITED",
      });
    },
  });

  // Apply global limiter to all API routes
  app.use("/api", globalLimiter);

  // Apply strict limiter to auth endpoints that accept credentials
  app.use("/api/auth/login",    authLimiter);
  app.use("/api/auth/register", authLimiter);
  app.use("/api/auth/refresh",  authLimiter);

  // =========================================================================
  // REQUEST PARSING MIDDLEWARE
  // =========================================================================

  // Parse JSON bodies (max 10mb to prevent payload flooding)
  app.use(express.json({ limit: "10mb" }));

  // Parse URL-encoded form bodies (for multipart forms if needed)
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Parse cookies — required for the HttpOnly refresh token cookie
  app.use(cookieParser(env.COOKIE_SECRET));

  // =========================================================================
  // HTTP REQUEST LOGGING (Morgan → Winston)
  // =========================================================================

  /**
   * Morgan pipes structured access logs into Winston so all log output
   * goes through one consistent pipeline (files, cloud log aggregators, etc.)
   */
  const morganFormat = env.isDev
    ? "dev"   // Colorized, human-readable in development
    : ":remote-addr :method :url :status :res[content-length] - :response-time ms";

  app.use(
    morgan(morganFormat, {
      stream: {
        write: (message) => logger.http(message.trim()),
      },
      // Skip logging health checks to reduce noise
      skip: (req) => req.path === "/api/health",
    })
  );

  // =========================================================================
  // HEALTH CHECK ROUTE
  // Responds before auth/rate limiting — used by load balancers and uptime monitors.
  // =========================================================================
  app.get("/api/health", async (req, res) => {
    let dbStatus = "ok";
    let dbLatency = null;

    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - start;
    } catch (err) {
      dbStatus = "error";
      logger.error("[Health] Database ping failed:", err.message);
    }

    const healthy = dbStatus === "ok";

    return res.status(healthy ? HTTP.OK : 503).json({
      success:   healthy,
      status:    healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      version:   process.env.npm_package_version || "1.0.0",
      services: {
        database: {
          status:      dbStatus,
          latencyMs:   dbLatency,
        },
        server: {
          status:    "ok",
          uptimeMs:  Math.round(process.uptime() * 1000),
          nodeVersion: process.version,
          env:       env.NODE_ENV,
        },
      },
    });
  });

  // =========================================================================
  // API ROUTES
  // All routes are versioned under /api — add /api/v2/... for breaking changes.
  // =========================================================================

  app.use("/api/auth", authRoutes);

  // ── Future module routes (add as each module is built) ────────────────────
  // app.use("/api/inventory",      require("./routes/inventory.routes"));
  // app.use("/api/purchase-orders",require("./routes/purchaseOrder.routes"));
  // app.use("/api/tasks",          require("./routes/task.routes"));
  // app.use("/api/analytics",      require("./routes/analytics.routes"));
  // app.use("/api/audit-logs",     require("./routes/auditLog.routes"));
  // app.use("/api/ai",             require("./routes/ai.routes"));

  // =========================================================================
  // ROOT ROUTE (informational — useful for quick curl checks)
  // =========================================================================
  app.get("/", (req, res) => {
    res.json({
      name:    "NexusERP API",
      version: "1.0.0",
      docs:    "/api/health",
      status:  "running",
    });
  });

  // =========================================================================
  // ERROR HANDLING  (must be registered AFTER all routes)
  // =========================================================================

  // 404 — no route matched
  app.use(notFoundHandler);

  // Global error handler — catches all next(err) and async throws
  app.use(globalErrorHandler);

  return app;
}

// =============================================================================
// Server startup
// =============================================================================
async function startServer() {
  // Verify database connection before binding to port
  try {
    await prisma.$connect();
    logger.info("[DB] PostgreSQL connection established");
  } catch (err) {
    logger.error("[DB] Failed to connect to PostgreSQL:", err.message);
    process.exit(1);
  }

  const app    = createApp();
  const PORT   = env.PORT;

  const server = app.listen(PORT, () => {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info(`  NexusERP API — ${env.NODE_ENV.toUpperCase()} mode`);
    logger.info(`  Listening on http://localhost:${PORT}`);
    logger.info(`  Health: http://localhost:${PORT}/api/health`);
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  // Give in-flight requests up to 10 seconds to finish before killing the process.
  // This prevents dropped connections during rolling deploys and container restarts.

  async function gracefulShutdown(signal) {
    logger.info(`[Shutdown] ${signal} received — starting graceful shutdown...`);

    server.close(async () => {
      logger.info("[Shutdown] HTTP server closed. No new connections accepted.");

      try {
        await prisma.$disconnect();
        logger.info("[Shutdown] Database disconnected cleanly.");
      } catch (err) {
        logger.error("[Shutdown] Error disconnecting database:", err.message);
      }

      logger.info("[Shutdown] Process exiting.");
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long (stuck requests)
    setTimeout(() => {
      logger.error("[Shutdown] Forced exit after timeout.");
      process.exit(1);
    }, 10_000);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM")); // Docker stop / Kubernetes
  process.on("SIGINT",  () => gracefulShutdown("SIGINT"));  // Ctrl+C in terminal

  // ── Unhandled rejection safety net ────────────────────────────────────────
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("[Process] Unhandled Promise Rejection:", {
      reason: reason instanceof Error ? reason.message : reason,
      stack:  reason instanceof Error ? reason.stack    : undefined,
    });
    // Don't crash in production on unhandled rejections — log and continue
    if (env.isDev) process.exit(1);
  });

  process.on("uncaughtException", (err) => {
    logger.error("[Process] Uncaught Exception — shutting down:", {
      message: err.message,
      stack:   err.stack,
    });
    // Uncaught exceptions leave the process in an undefined state — always exit
    process.exit(1);
  });

  return server;
}

// ── Run if this file is the entry point (not when imported in tests) ──────────
if (require.main === module) {
  startServer().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
}

module.exports = { createApp, startServer };
