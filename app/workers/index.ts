/**
 * BullMQ worker process — run separately from the Remix server:
 *   node --loader ts-node/esm app/workers/index.ts
 *   OR: npm run worker
 *
 * This process is stateless and horizontally scalable.
 * Add more worker instances to increase throughput.
 */
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import type { CacheWarmJob, FullOptimizeJob, PSIScanJob, CleanupJob } from "../queues/jobs.server";
import { runPSI } from "../lib/psi.server";

const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const db = new PrismaClient();

// ─── CACHE WARM WORKER ─────────────────────────────────────────────────────
const cacheWarmWorker = new Worker<CacheWarmJob>(
  "cache-warm",
  async (job) => {
    const { shopId, shopDomain, reason } = job.data;
    console.log(`[CacheWarm] Starting for ${shopDomain}, reason: ${reason}`);

    const shop = await db.shop.findUnique({
      where: { id: shopId },
      include: { settings: true },
    });
    if (!shop?.settings?.fullPageCacheEnabled) return;

    // Key pages to warm
    const pagesToWarm = [
      `https://${shopDomain}/`,
      `https://${shopDomain}/collections/all`,
      `https://${shopDomain}/products`,
    ];

    for (const url of pagesToWarm) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "SpeedOptimizer/1.0 CacheWarm" },
          signal: AbortSignal.timeout(15_000),
        });

        if (res.ok) {
          const html = await res.text();
          const ttl = shop.settings.browserCacheTtl;

          await db.cacheEntry.upsert({
            where: { shopId_url: { shopId, url } },
            create: {
              shopId,
              url,
              htmlContent: html,
              ttl,
              expiresAt: new Date(Date.now() + ttl * 1000),
            },
            update: {
              htmlContent: html,
              ttl,
              expiresAt: new Date(Date.now() + ttl * 1000),
              updatedAt: new Date(),
            },
          });
        }
      } catch (err) {
        console.error(`[CacheWarm] Failed to warm ${url}:`, err);
      }
    }

    await db.optimizationLog.create({
      data: {
        shopId,
        action: "cache_warm",
        status: "SUCCESS",
        details: { reason, pagesWarmed: pagesToWarm.length },
        finishedAt: new Date(),
      },
    });

    console.log(`[CacheWarm] Done for ${shopDomain}`);
  },
  { connection: redis, concurrency: 3 }
);

// ─── FULL OPTIMIZE WORKER ──────────────────────────────────────────────────
const fullOptimizeWorker = new Worker<FullOptimizeJob>(
  "full-optimize",
  async (job) => {
    const { shopId, shopDomain } = job.data;
    console.log(`[FullOptimize] Starting for ${shopDomain}`);

    await db.optimizationLog.create({
      data: {
        shopId,
        action: "full_optimize",
        status: "RUNNING",
        details: { shopDomain },
      },
    });

    try {
      // 1. Purge stale cache
      await db.cacheEntry.deleteMany({
        where: { shopId, expiresAt: { lt: new Date() } },
      });

      // 2. Queue PSI scan for homepage (mobile + desktop)
      const { queuePSIScan } = await import("../queues/jobs.server");
      await queuePSIScan({ shopId, shopDomain, url: `https://${shopDomain}/`, strategy: "mobile" });
      await queuePSIScan({ shopId, shopDomain, url: `https://${shopDomain}/`, strategy: "desktop" });

      // 3. Queue cache warm
      const { queueCacheWarm } = await import("../queues/jobs.server");
      await queueCacheWarm({ shopId, shopDomain, reason: "full_optimize" });

      await db.optimizationLog.updateMany({
        where: { shopId, action: "full_optimize", status: "RUNNING" },
        data: { status: "SUCCESS", finishedAt: new Date() },
      });
    } catch (err) {
      await db.optimizationLog.updateMany({
        where: { shopId, action: "full_optimize", status: "RUNNING" },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
          finishedAt: new Date(),
        },
      });
      throw err;
    }
  },
  { connection: redis, concurrency: 2 }
);

// ─── PSI SCAN WORKER ───────────────────────────────────────────────────────
const psiWorker = new Worker<PSIScanJob>(
  "psi-scan",
  async (job) => {
    const { shopId, shopDomain, url, strategy } = job.data;
    console.log(`[PSI] Scanning ${url} (${strategy ?? "mobile"})`);

    try {
      await runPSI(shopId, url, strategy ?? "mobile");
      console.log(`[PSI] Done: ${url}`);
    } catch (err) {
      console.error(`[PSI] Failed: ${url}`, err);
      throw err;
    }
  },
  { connection: redis, concurrency: 2 }
);

// ─── CLEANUP WORKER ────────────────────────────────────────────────────────
const cleanupWorker = new Worker<CleanupJob>(
  "cleanup",
  async (job) => {
    const { shopId, type } = job.data;
    console.log(`[Cleanup] Running ${type} for shop ${shopId}`);

    switch (type) {
      case "expired_cache": {
        const { count } = await db.cacheEntry.deleteMany({
          where: { shopId, expiresAt: { lt: new Date() } },
        });
        console.log(`[Cleanup] Deleted ${count} expired cache entries`);
        break;
      }
      case "old_scores": {
        // Keep only last 90 days of scores
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const { count } = await db.performanceScore.deleteMany({
          where: { shopId, recordedAt: { lt: cutoff } },
        });
        console.log(`[Cleanup] Deleted ${count} old performance scores`);
        break;
      }
    }
  },
  { connection: redis, concurrency: 5 }
);

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[Workers] Received ${signal}, shutting down gracefully...`);
  await Promise.all([
    cacheWarmWorker.close(),
    fullOptimizeWorker.close(),
    psiWorker.close(),
    cleanupWorker.close(),
  ]);
  await db.$disconnect();
  await redis.quit();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log("[Workers] All BullMQ workers started and listening...");
