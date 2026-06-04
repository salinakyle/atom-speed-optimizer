import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "../db.server";

// Health check endpoint used by Fly.io and other load balancers
export const loader = async (_: LoaderFunctionArgs) => {
  try {
    await db.$queryRaw`SELECT 1`;
    return json({ status: "ok", db: "connected", ts: Date.now() });
  } catch {
    return json({ status: "error", db: "disconnected" }, { status: 503 });
  }
};
