import { Queue } from "bullmq";
import { redis } from "./redis.server";

// ─── Queue definitions ─────────────────────────────────────────────────────
const QUEUE_OPTS = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
};

export const cacheWarmQueue = new Queue("cache-warm", QUEUE_OPTS);
export const fullOptimizeQueue = new Queue("full-optimize", QUEUE_OPTS);
export const psiScanQueue = new Queue("psi-scan", QUEUE_OPTS);
export const cleanupQueue = new Queue("cleanup", QUEUE_OPTS);

// ─── Job payload types ─────────────────────────────────────────────────────
export interface CacheWarmJob {
  shopId: string;
  shopDomain: string;
  reason: string;
  payload?: Record<string, unknown>;
}

export interface FullOptimizeJob {
  shopId: string;
  shopDomain: string;
}

export interface PSIScanJob {
  shopId: string;
  shopDomain: string;
  url: string;
  strategy?: "mobile" | "desktop";
}

export interface CleanupJob {
  shopId: string;
  type: "expired_cache" | "old_scores" | "orphaned_metafields";
}

// ─── Queue helpers ─────────────────────────────────────────────────────────
export async function queueCacheWarm(data: CacheWarmJob) {
  return cacheWarmQueue.add("warm", data, {
    jobId: `warm-${data.shopId}-${Date.now()}`,
  });
}

export async function queueFullOptimize(data: FullOptimizeJob) {
  // Deduplicate — only one full optimize per shop at a time
  return fullOptimizeQueue.add("optimize", data, {
    jobId: `optimize-${data.shopId}`,
    removeOnComplete: true,
  });
}

export async function queuePSIScan(data: PSIScanJob) {
  return psiScanQueue.add("scan", data, {
    jobId: `psi-${data.shopId}-${encodeURIComponent(data.url)}-${data.strategy ?? "mobile"}`,
  });
}

export async function queueCleanup(data: CleanupJob) {
  return cleanupQueue.add("cleanup", data);
}
