import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { runPSI } from "../lib/psi.server";

/**
 * Direct PSI API endpoint — for synchronous scans from the UI.
 * Use queuePSIScan() for background / async scans.
 *
 * POST /api/psi
 * Body: { url, strategy }
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const body = await request.json() as { url?: string; strategy?: "mobile" | "desktop" };
  const targetUrl = body?.url ?? `https://${session.shop}/`;
  const strategy = body?.strategy ?? "mobile";

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  if (!process.env.GOOGLE_PAGESPEED_API_KEY) {
    return json({ error: "GOOGLE_PAGESPEED_API_KEY not configured" }, { status: 400 });
  }

  try {
    const result = await runPSI(shop.id, targetUrl, strategy);
    return json({ success: true, result });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "PSI scan failed" },
      { status: 500 }
    );
  }
};
