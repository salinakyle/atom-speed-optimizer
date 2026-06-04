import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { generateOptimizationScript, generateHeadInjection } from "../lib/optimization-engine.server";

/**
 * App Proxy endpoint — mounted at /apps/speedopt/*
 * Serves:
 *   /apps/speedopt/script.js   → the optimization engine JS
 *   /apps/speedopt/head.html   → head injection HTML fragment
 *   /apps/speedopt/rum         → RUM beacon data ingestion (POST)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const pathname = url.searchParams.get("path_prefix") ?? url.pathname;

  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
    include: {
      settings: true,
      scriptRules: { where: { enabled: true } },
    },
  });

  if (!shop?.settings) {
    return new Response("/* Shop not configured */", {
      headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store" },
    });
  }

  // ─── /apps/speedopt/script.js ──────────────────────────────────────────
  if (pathname.includes("script.js") || url.searchParams.get("type") === "script") {
    const js = generateOptimizationScript(shop.settings, shop.scriptRules);

    return new Response(js, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "X-Content-Type-Options": "nosniff",
        Vary: "Accept-Encoding",
      },
    });
  }

  // ─── /apps/speedopt/head.html ──────────────────────────────────────────
  if (pathname.includes("head.html") || url.searchParams.get("type") === "head") {
    const html = generateHeadInjection(shop.settings);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};

// ─── POST: RUM beacon ingestion ────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  const body = await request.json().catch(() => null);
  if (!body) return new Response(null, { status: 400 });

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return new Response(null, { status: 404 });

  const { lcp, inp, fid, cls, fcp, ttfb, url: pageUrl, device } = body as {
    lcp?: number; inp?: number; fid?: number; cls?: number;
    fcp?: number; ttfb?: number; url?: string; device?: string;
  };

  if (!pageUrl) return new Response(null, { status: 400 });

  const { calculateCompositeScore } = await import("../lib/optimization-engine.server");

  const score = calculateCompositeScore({ lcp, inp, cls: cls != null ? cls * 1000 : undefined, fcp, ttfb });

  await db.performanceScore.create({
    data: {
      shopId: shop.id,
      url: pageUrl,
      source: "RUM",
      lcp: lcp ?? null,
      inp: inp ?? null,
      fid: fid ?? null,
      cls: cls != null ? cls * 1000 : null,
      fcp: fcp ?? null,
      ttfb: ttfb ?? null,
      score,
      device: device === "mobile" ? "MOBILE" : device === "tablet" ? "TABLET" : "DESKTOP",
    },
  });

  // Check alert thresholds
  await checkAlerts(shop.id, { lcp, inp, cls, fcp, ttfb, score });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};

async function checkAlerts(
  shopId: string,
  metrics: Record<string, number | undefined>
) {
  const thresholds = await db.alertThreshold.findMany({
    where: { shopId, enabled: true },
  });

  for (const t of thresholds) {
    const val = metrics[t.metric];
    if (val == null) continue;
    const breached = t.operator === "gt" ? val > t.value : val < t.value;
    if (breached) {
      await db.optimizationLog.create({
        data: {
          shopId,
          action: `alert_${t.metric}_${t.operator}_${t.value}`,
          status: "FAILED",
          details: { metric: t.metric, value: val, threshold: t.value, operator: t.operator },
          finishedAt: new Date(),
        },
      });
    }
  }
}
