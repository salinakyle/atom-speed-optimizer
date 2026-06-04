/**
 * Recurring job scheduler — runs once at startup.
 * Uses BullMQ's repeat/cron feature to schedule jobs that run for ALL shops.
 *
 * Start alongside the main worker:
 *   node app/workers/scheduler.js
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";

const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const db = new PrismaClient();

const QUEUE_OPTS = { connection: redis };
const psiQueue = new Queue("psi-scan", QUEUE_OPTS);
const cleanupQueue = new Queue("cleanup", QUEUE_OPTS);

async function scheduleRecurringJobs() {
  console.log("[Scheduler] Setting up recurring jobs...");

  // For each active shop: schedule daily PSI scan (mobile + desktop)
  const activeShops = await db.shop.findMany({
    where: { uninstalledAt: null },
    select: { id: true, domain: true },
  });

  console.log(`[Scheduler] Scheduling PSI scans for ${activeShops.length} shops`);

  for (const shop of activeShops) {
    // Daily mobile PSI scan at 3am UTC
    await psiQueue.upsertJobScheduler(
      `daily-psi-mobile-${shop.id}`,
      { pattern: "0 3 * * *" },
      {
        name: "scan",
        data: {
          shopId: shop.id,
          shopDomain: shop.domain,
          url: `https://${shop.domain}/`,
          strategy: "mobile" as const,
        },
        opts: { attempts: 2, removeOnComplete: true },
      }
    );

    // Daily desktop PSI scan at 3:30am UTC
    await psiQueue.upsertJobScheduler(
      `daily-psi-desktop-${shop.id}`,
      { pattern: "30 3 * * *" },
      {
        name: "scan",
        data: {
          shopId: shop.id,
          shopDomain: shop.domain,
          url: `https://${shop.domain}/`,
          strategy: "desktop" as const,
        },
        opts: { attempts: 2, removeOnComplete: true },
      }
    );

    // Weekly cleanup at Sunday 2am UTC
    await cleanupQueue.upsertJobScheduler(
      `weekly-cleanup-${shop.id}`,
      { pattern: "0 2 * * 0" },
      {
        name: "cleanup",
        data: { shopId: shop.id, type: "old_scores" as const },
        opts: { attempts: 1, removeOnComplete: true },
      }
    );

    // Expired cache cleanup — every 6 hours
    await cleanupQueue.upsertJobScheduler(
      `cache-cleanup-${shop.id}`,
      { pattern: "0 */6 * * *" },
      {
        name: "cleanup",
        data: { shopId: shop.id, type: "expired_cache" as const },
        opts: { attempts: 1, removeOnComplete: true },
      }
    );
  }

  console.log("[Scheduler] All recurring jobs scheduled.");
}

scheduleRecurringJobs()
  .catch(console.error)
  .finally(async () => {
    await db.$disconnect();
    // Keep the scheduler process running to handle re-scheduling
    process.on("SIGTERM", async () => {
      await redis.quit();
      process.exit(0);
    });
  });
