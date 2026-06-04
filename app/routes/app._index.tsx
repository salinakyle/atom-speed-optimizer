import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Badge,
  Divider,
  Box,
  ProgressBar,
  DataTable,
  EmptyState,
  Spinner,
  Tooltip,
  Icon,
} from "@shopify/polaris";
import { InfoIcon, AlertDiamondIcon, CheckIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { ScoreGauge } from "../components/ScoreGauge";
import { MetricCard } from "../components/MetricCard";
import { queueCacheWarm, queueFullOptimize } from "../queues/jobs.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await db.shop.findUnique({
    where: { domain: shopDomain },
    include: {
      settings: true,
      alertThresholds: true,
    },
  });

  if (!shop) {
    return json({ shop: null, latestScore: null, recentLogs: [], scoreHistory: [] });
  }

  // Latest composite score from RUM or PSI
  const latestScore = await db.performanceScore.findFirst({
    where: { shopId: shop.id },
    orderBy: { recordedAt: "desc" },
  });

  // Score history for sparkline (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const scoreHistory = await db.performanceScore.findMany({
    where: {
      shopId: shop.id,
      recordedAt: { gte: sevenDaysAgo },
      source: "PSI",
    },
    orderBy: { recordedAt: "asc" },
    select: { score: true, lcp: true, cls: true, inp: true, recordedAt: true },
    take: 30,
  });

  // Recent activity logs
  const recentLogs = await db.optimizationLog.findMany({
    where: { shopId: shop.id },
    orderBy: { startedAt: "desc" },
    take: 5,
  });

  // Cache stats
  const cacheCount = await db.cacheEntry.count({ where: { shopId: shop.id } });
  const totalCacheHits = await db.cacheEntry.aggregate({
    where: { shopId: shop.id },
    _sum: { hits: true },
  });

  return json({
    shop: {
      id: shop.id,
      domain: shopDomain,
      plan: shop.plan,
      onboardingDone: shop.onboardingDone,
      settings: shop.settings,
    },
    latestScore,
    recentLogs,
    scoreHistory,
    stats: {
      cacheCount,
      totalCacheHits: totalCacheHits._sum.hits ?? 0,
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
  });

  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  switch (intent) {
    case "optimize_all": {
      await queueFullOptimize({ shopId: shop.id, shopDomain: session.shop });
      await db.optimizationLog.create({
        data: {
          shopId: shop.id,
          action: "full_optimize_queued",
          status: "PENDING",
          details: { triggeredBy: "dashboard_button" },
        },
      });
      return json({ success: true, message: "Full optimization queued!" });
    }
    case "warm_cache": {
      await queueCacheWarm({ shopId: shop.id, shopDomain: session.shop, reason: "manual" });
      return json({ success: true, message: "Cache warming started!" });
    }
    case "purge_cache": {
      await db.cacheEntry.deleteMany({ where: { shopId: shop.id } });
      return json({ success: true, message: "Cache purged successfully." });
    }
    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }
};

function cwvStatus(metric: string, value: number | null | undefined): "success" | "warning" | "critical" {
  if (value == null) return "critical";
  const thresholds: Record<string, [number, number]> = {
    lcp: [2500, 4000],
    inp: [200, 500],
    cls: [100, 250],
    fcp: [1800, 3000],
    ttfb: [800, 1800],
    score: [90, 50],
  };
  const [good, poor] = thresholds[metric] ?? [0, 0];
  if (metric === "score") {
    return value >= good ? "success" : value >= poor ? "warning" : "critical";
  }
  return value <= good ? "success" : value <= poor ? "warning" : "critical";
}

export default function Dashboard() {
  const { shop, latestScore, recentLogs, scoreHistory, stats } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const isOptimizing = fetcher.state !== "idle";

  if (!shop?.onboardingDone) {
    return (
      <Page>
        <EmptyState
          heading="Welcome to Speed Optimizer ⚡"
          action={{
            content: "Start Setup",
            onAction: () => navigate("/app/onboarding"),
          }}
          image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
        >
          <p>Let's configure your store for maximum performance in just 3 steps.</p>
        </EmptyState>
      </Page>
    );
  }

  const score = latestScore?.score ?? null;
  const scoreStatus = cwvStatus("score", score);

  const logRows = recentLogs.map((log) => [
    log.action.replace(/_/g, " "),
    <Badge tone={log.status === "SUCCESS" ? "success" : log.status === "FAILED" ? "critical" : "attention"}>
      {log.status}
    </Badge>,
    new Date(log.startedAt).toLocaleString(),
  ]);

  return (
    <Page
      title="Speed Optimizer"
      subtitle={`${shop.domain} — ${shop.plan} plan`}
      primaryAction={{
        content: isOptimizing ? "Optimizing..." : "⚡ Optimize Everything",
        onAction: () => {
          fetcher.submit({ intent: "optimize_all" }, { method: "POST" });
        },
        loading: isOptimizing,
        tone: "success",
      }}
      secondaryActions={[
        {
          content: "Warm Cache",
          onAction: () => fetcher.submit({ intent: "warm_cache" }, { method: "POST" }),
          disabled: isOptimizing,
        },
        {
          content: "Purge Cache",
          onAction: () => fetcher.submit({ intent: "purge_cache" }, { method: "POST" }),
          destructive: true,
          disabled: isOptimizing,
        },
      ]}
    >
      <BlockStack gap="500">
        {fetcher.data && "message" in fetcher.data && (
          <Banner tone="success" onDismiss={() => {}}>
            {fetcher.data.message}
          </Banner>
        )}

        {/* ─── Performance Score Hero ─── */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400" align="center">
                <Text as="h2" variant="headingMd">Overall Score</Text>
                <ScoreGauge score={score} status={scoreStatus} />
                <Text as="p" variant="bodySm" tone="subdued">
                  {score == null
                    ? "No data yet — run PageSpeed Insights"
                    : `Last measured: ${new Date(latestScore!.recordedAt).toLocaleDateString()}`}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <BlockStack gap="400">
              <InlineStack gap="400" wrap>
                <MetricCard
                  label="LCP"
                  value={latestScore?.lcp}
                  unit="ms"
                  status={cwvStatus("lcp", latestScore?.lcp)}
                  good={2500}
                  poor={4000}
                  tooltip="Largest Contentful Paint — target < 2.5s"
                />
                <MetricCard
                  label="INP"
                  value={latestScore?.inp}
                  unit="ms"
                  status={cwvStatus("inp", latestScore?.inp)}
                  good={200}
                  poor={500}
                  tooltip="Interaction to Next Paint — target < 200ms"
                />
                <MetricCard
                  label="CLS"
                  value={latestScore?.cls != null ? latestScore.cls / 1000 : null}
                  unit=""
                  status={cwvStatus("cls", latestScore?.cls)}
                  good={0.1}
                  poor={0.25}
                  tooltip="Cumulative Layout Shift — target < 0.1"
                  isDecimal
                />
                <MetricCard
                  label="FCP"
                  value={latestScore?.fcp}
                  unit="ms"
                  status={cwvStatus("fcp", latestScore?.fcp)}
                  good={1800}
                  poor={3000}
                  tooltip="First Contentful Paint — target < 1.8s"
                />
                <MetricCard
                  label="TTFB"
                  value={latestScore?.ttfb}
                  unit="ms"
                  status={cwvStatus("ttfb", latestScore?.ttfb)}
                  good={800}
                  poor={1800}
                  tooltip="Time to First Byte — target < 800ms"
                />
              </InlineStack>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* ─── Cache Stats ─── */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Cache Status</Text>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd">Cached Pages</Text>
                  <Badge tone="info">{String(stats?.cacheCount ?? 0)}</Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd">Total Cache Hits</Text>
                  <Badge tone="success">{String(stats?.totalCacheHits ?? 0)}</Badge>
                </InlineStack>
                <Divider />
                <Button
                  onClick={() => navigate("/app/cache")}
                  variant="plain"
                >
                  Manage Cache →
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Optimizations Active</Text>
                <Divider />
                {shop.settings && (
                  <>
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">JS Defer</Text>
                      <Badge tone={shop.settings.deferJsEnabled ? "success" : "critical"}>
                        {shop.settings.deferJsEnabled ? "ON" : "OFF"}
                      </Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">Critical CSS</Text>
                      <Badge tone={shop.settings.criticalCssEnabled ? "success" : "critical"}>
                        {shop.settings.criticalCssEnabled ? "ON" : "OFF"}
                      </Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">Image Lazy Load</Text>
                      <Badge tone={shop.settings.lazyLoadImages ? "success" : "critical"}>
                        {shop.settings.lazyLoadImages ? "ON" : "OFF"}
                      </Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">Prefetch on Hover</Text>
                      <Badge tone={shop.settings.prefetchOnHover ? "success" : "critical"}>
                        {shop.settings.prefetchOnHover ? "ON" : "OFF"}
                      </Badge>
                    </InlineStack>
                  </>
                )}
                <Divider />
                <Button onClick={() => navigate("/app/settings")} variant="plain">
                  Configure Settings →
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Quick Actions</Text>
                <Divider />
                <Button onClick={() => navigate("/app/vitals")} variant="secondary" fullWidth>
                  View CWV History
                </Button>
                <Button onClick={() => navigate("/app/scripts")} variant="secondary" fullWidth>
                  Script Manager
                </Button>
                <Button onClick={() => navigate("/app/images")} variant="secondary" fullWidth>
                  Image Optimizer
                </Button>
                <Button onClick={() => navigate("/app/logs")} variant="secondary" fullWidth>
                  Activity Logs
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* ─── Recent Activity ─── */}
        {recentLogs.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Recent Activity</Text>
              <DataTable
                columnContentTypes={["text", "text", "text"]}
                headings={["Action", "Status", "Time"]}
                rows={logRows}
              />
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
