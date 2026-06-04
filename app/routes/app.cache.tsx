import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  DataTable,
  Badge,
  Banner,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { queueCacheWarm } from "../queues/jobs.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
    include: { settings: true },
  });
  if (!shop) throw new Response("Not found", { status: 404 });

  const entries = await db.cacheEntry.findMany({
    where: { shopId: shop.id },
    orderBy: { hits: "desc" },
    take: 50,
  });

  const stats = await db.cacheEntry.aggregate({
    where: { shopId: shop.id },
    _count: { _all: true },
    _sum: { hits: true },
  });

  return json({
    shopId: shop.id,
    shopDomain: session.shop,
    entries,
    stats: {
      count: stats._count._all,
      totalHits: stats._sum.hits ?? 0,
    },
    cacheEnabled: shop.settings?.fullPageCacheEnabled ?? false,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  switch (intent) {
    case "purge_all": {
      const { count } = await db.cacheEntry.deleteMany({ where: { shopId: shop.id } });
      return json({ success: true, message: `Purged ${count} cache entries.` });
    }
    case "purge_url": {
      const url = String(formData.get("url"));
      await db.cacheEntry.deleteMany({ where: { shopId: shop.id, url } });
      return json({ success: true, message: `Purged cache for: ${url}` });
    }
    case "warm_cache": {
      await queueCacheWarm({ shopId: shop.id, shopDomain: session.shop, reason: "manual" });
      return json({ success: true, message: "Cache warming job queued." });
    }
    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
};

export default function CachePage() {
  const { entries, stats, cacheEnabled, shopDomain } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const rows = entries.map((e) => [
    e.url.replace(`https://${shopDomain}`, ""),
    String(e.hits),
    new Date(e.expiresAt).toLocaleString(),
    <Badge tone={new Date(e.expiresAt) > new Date() ? "success" : "critical"}>
      {new Date(e.expiresAt) > new Date() ? "Valid" : "Expired"}
    </Badge>,
    <Button
      size="slim"
      tone="critical"
      onClick={() => fetcher.submit({ intent: "purge_url", url: e.url }, { method: "POST" })}
    >
      Purge
    </Button>,
  ]);

  return (
    <Page
      title="Cache Manager"
      primaryAction={{
        content: "Warm Cache",
        onAction: () => fetcher.submit({ intent: "warm_cache" }, { method: "POST" }),
        loading: fetcher.state !== "idle",
      }}
      secondaryActions={[{
        content: "Purge All Cache",
        onAction: () => fetcher.submit({ intent: "purge_all" }, { method: "POST" }),
        destructive: true,
      }]}
    >
      <BlockStack gap="500">
        {fetcher.data && "message" in fetcher.data && (
          <Banner tone="success">{fetcher.data.message}</Banner>
        )}

        {!cacheEnabled && (
          <Banner tone="warning">
            Full-page caching is disabled. Enable it in Settings to use the cache manager.
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Cache Stats</Text>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="p">Cached pages</Text>
                  <Badge tone="info">{String(stats.count)}</Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="p">Total cache hits</Text>
                  <Badge tone="success">{String(stats.totalHits)}</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Cached Pages</Text>
            {entries.length === 0 ? (
              <Banner tone="info">
                No cached pages yet. Click "Warm Cache" to pre-generate the cache.
              </Banner>
            ) : (
              <DataTable
                columnContentTypes={["text", "numeric", "text", "text", "text"]}
                headings={["URL", "Hits", "Expires", "Status", "Actions"]}
                rows={rows}
                truncate
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
