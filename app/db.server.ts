import { PrismaClient } from "@prisma/client";

// Singleton pattern — Remix dev server hot-reloads modules; without this
// you'd exhaust the PostgreSQL connection pool during development.
declare global {
  var __db__: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

const db: PrismaClient = global.__db__ ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__db__ = db;
}

export { db };
