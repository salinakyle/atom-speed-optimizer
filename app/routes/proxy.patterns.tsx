import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

/**
 * App Proxy endpoint: /apps/speedopt/patterns
 * Returns JSON list of URL patterns to delay for this shop.
 * Called by the storefront JS asset during session init.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) {
    return new Response(JSON.stringify({ patterns: [] }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  }

  const rules = await db.scriptRule.findMany({
    where: { shopId: shop.id, enabled: true, action: "DELAY" },
    select: { pattern: true },
  });

  return new Response(
    JSON.stringify({ patterns: rules.map((r) => r.pattern) }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": `https://${session.shop}`,
      },
    }
  );
};
