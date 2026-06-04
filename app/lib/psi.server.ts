import { db } from "../db.server";
import { calculateCompositeScore } from "./optimization-engine.server";

const PSI_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface PSIResult {
  url: string;
  score: number;
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  fcp: number | null;
  ttfb: number | null;
  inp: number | null;
  device: "mobile" | "desktop";
  fetchedAt: Date;
}

/**
 * Calls the Google PageSpeed Insights API and persists the result.
 * Rate limit: 25,000 requests/day on the free key.
 */
export async function runPSI(
  shopId: string,
  url: string,
  strategy: "mobile" | "desktop" = "mobile"
): Promise<PSIResult> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_PAGESPEED_API_KEY not configured");
  }

  const psiUrl = new URL(PSI_BASE);
  psiUrl.searchParams.set("url", url);
  psiUrl.searchParams.set("strategy", strategy);
  psiUrl.searchParams.set("key", apiKey);
  psiUrl.searchParams.set("category", "performance");

  const res = await fetch(psiUrl.toString(), {
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PSI API error ${res.status}: ${text}`);
  }

  const data = await res.json() as PSIAPIResponse;

  const audits = data.lighthouseResult?.audits ?? {};
  const categories = data.lighthouseResult?.categories?.performance;

  const getNumericAudit = (key: string): number | null => {
    const val = audits[key]?.numericValue;
    return typeof val === "number" ? val : null;
  };

  const lcp = getNumericAudit("largest-contentful-paint");
  const fcp = getNumericAudit("first-contentful-paint");
  const ttfb = getNumericAudit("server-response-time");
  const cls = getNumericAudit("cumulative-layout-shift");
  const inp = getNumericAudit("interaction-to-next-paint");
  const fid = getNumericAudit("max-potential-fid");

  const rawScore = categories?.score ?? 0;
  const score = Math.round(rawScore * 100);

  const result: PSIResult = {
    url,
    score,
    lcp,
    fid,
    cls: cls != null ? cls * 1000 : null, // store as scaled int
    fcp,
    ttfb,
    inp,
    device: strategy,
    fetchedAt: new Date(),
  };

  await db.performanceScore.create({
    data: {
      shopId,
      url,
      source: "PSI",
      score,
      lcp,
      fcp,
      ttfb,
      cls: cls != null ? cls * 1000 : null,
      inp,
      fid,
      device: strategy === "mobile" ? "MOBILE" : "DESKTOP",
    },
  });

  return result;
}

// Minimal PSI API response type
interface PSIAPIResponse {
  lighthouseResult?: {
    audits?: Record<string, { numericValue?: number; displayValue?: string }>;
    categories?: {
      performance?: { score?: number };
    };
  };
}
