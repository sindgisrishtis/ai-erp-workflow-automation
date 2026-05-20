/**
 * src/config/prisma.js
 *
 * Singleton Prisma client instance.
 * Reuses the same client across the entire application to prevent
 * connection pool exhaustion — especially important in development
 * where module hot-reloading can create multiple instances.
 */

"use strict";

const { PrismaClient } = require("@prisma/client");
const env = require("./env");

// In development, store on the global object to survive hot reloads.
// In production, always create a fresh singleton.
const globalForPrisma = global;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: env.isDev
      ? ["query", "warn", "error"]  // Verbose logging in development
      : ["warn", "error"],           // Minimal logging in production
    errorFormat: env.isDev ? "pretty" : "minimal",
  });

if (env.isDev) {
  globalForPrisma.__prisma = prisma;
}

// Graceful shutdown: disconnect Prisma when the process exits
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

module.exports = prisma;