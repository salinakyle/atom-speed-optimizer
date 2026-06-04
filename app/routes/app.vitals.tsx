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
  Select,
  Divider,
  Banner,
  Spinner,
  Box,
  Tabs,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { ScoreGauge } from "../components/ScoreGauge";
import { MetricCard } from "../components/MetricCard";
import { queuePSIScan } from "../queues/jobs.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filter = url.searchParams.get("days") ?? "7";
  const days = parseInt(filter, 10);
  const device = url.searchParams.get("device") ?? "MOBILE";

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) throw new Response("Not found", { status: 404 });

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Latest scores per source
  const latestRUM = await db.performanceScore.findFirst({
    where: { shopId: shop.id, source: "RUM", device: device as "MOBILE" | "DESKTOP" },
    orderBy: { recordedAt: "desc" },
  });

  const latestPSI = await db.performanceScore.findFirst({
    where: { shopId: shop.id, source: "PSI", device: device as "MOBILE" | "DESKTOP" },
    orderBy: { recordedAt: "desc" },
  });

  // Historical scores for chart
  const history = await db.performanceScore.findMany({
    where: {
      shopId: shop.id,
      recordedAt: { gte: since },
      device: device as "MOBILE" | "DESKTOP",
    },
    orderBy: { recordedAt: "asc" },
    select: {
      score: true,
      lcp: true,
      cls: true,
      inp: true,
      fcp: true,
      ttfb: true,
      source: true,
      device: true,
      recordedAt: true,
      url: true,
    },
  });

  // Per-URL breakdown
  const urlBreakdown = await db.performanceScore.groupBy({
    by: ["url"],
    where: { shopId: shop.id, recordedAt: { gte: since } },
    _avg: { score: true, lcp: true, cls: true, inp: true },
    _count: { _all: true },
    orderBy: { _avg: { score: "asc" } },
    take: 20,
  });

  return json({
    shopDomain: session.shop,
    shopId: shop.id,
    latestRUM,
    latestPSI,
    history,
    urlBreakdown,
    filter: { days, device },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const targetUrl = String(formData.get("url") ?? `https://${session.shop}/`);

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  if (intent === "run_psi") {
    await queuePSIScan({
      shopId: shop.id,
      shopDomain: session.shop,
      url: targetUrl,
      strategy: (formData.get("strategy") as "mobile" | "desktop") ?? "mobile",
    });
    return json({ success: true, message: `PageSpeed Insights scan queued for ${targetUrl}` });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

function cwvStatus(metric: string, value: number | null | undefined): "success" | "warning" | "critical" {
  if (value == null) return "critical";
  const good: Record<string, number> = { lcp: 2500, inp: 200, cls: 100, fcp: 1800, ttfb: 800, score: 90 };
  const poor: Record<string, number> = { lcp: 4000, inp: 500, cls: 250, fcp: 3000, ttfb: 1800, score: 50 };
  if (metric === "score") {
    return value >= good[metric]! ? "success" : value >= poor[metric]! ? "warning" : "critical";
  }
  return value <= good[metric]! ? "success" : value <= poor[metric]! ? "warning" : "critical";
}

export default function VitalsPage() {
  const { shopDomain, shopId, latestRUM, latestPSI, history, urlBreakdown, filter } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [selectedTab, setSelectedTab] = useState(0);
  const [psiUrl, setPsiUrl] = useState(`https://${shopDomain}/`);

  const isRunning = fetcher.state !== "idle";

  const tabs = [
    { id: "rum", content: "Real User Data (RUM)" },
    { id: "psi", content: "Lab Data (PageSpeed)" },
    { id: "history", content: "History" },
    { id: "urls", content: "Per-URL Breakdown" },
  ];

  const activeScore = selectedTab === 0 ? latestRUM : latestPSI;

  const historyRows = history.slice(-20).map((h) => [
    new Date(h.recordedAt).toLocaleDateString(),
    h.url,
    <Badge tone={h.source === "RUM" ? "info" : "success"}>{h.source}</Badge>,
    h.score != null ? Math.round(h.score) : "—",
    h.lcp != null ? `${Math.round(h.lcp)}ms` : "—",
    h.cls != null ? (h.cls / 1000).toFixed(3) : "—",
    h.inp != null ? `${Math.round(h.inp)}ms` : "—",
  ]);

  const urlRows = urlBreakdown.map((u) => [
    u.url,
    u._avg.score != null ? Math.round(u._avg.score) : "—",
    u._avg.lcp != null ? `${Math.round(u._avg.lcp)}ms` : "—",
    u._avg.cls != null ? (u._avg.cls / 1000).toFixed(3) : "—",
    u._avg.inp != null ? `${Math.round(u._avg.inp)}ms` : "—",
    u._count._all,
  ]);

  return (
    <Page
      title="Core Web Vitals"
      subtitle="Monitor real and lab performance metrics"
    >
      <BlockStack gap="500">
        {fetcher.data && "message" in fetcher.data && (
          <Banner tone="success">{fetcher.data.message}</Banner>
        )}

        {/* ─── Tabs ─── */}
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
          {/* ─── RUM / PSI Score Panel ─── */}
          {selectedTab < 2 && (
            <Card>
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    {selectedTab === 0 ? "Real User Monitoring" : "PageSpeed Insights (Lab Data)"}
                  </Text>
                  {activeScore && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Last updated: {new Date(activeScore.recordedAt).toLocaleString()}
                    </Text>
                  )}
                </InlineStack>
                <Divider />

                {!activeScore ? (
                  <Banner tone="info">
                    {selectedTab === 0
                      ? "No RUM data yet. Install the Theme App Extension to start collecting real user data."
                      : "No PSI data yet. Run a PageSpeed Insights scan below."}
                  </Banner>
                ) : (
                  <Layout>
                    <Layout.Section variant="oneThird">
                      <BlockStack gap="300" align="center">
                        <ScoreGauge
                          score={activeScore.score}
                          status={cwvStatus("score", activeScore.score)}
                          size={160}
                        />
                        <Badge tone={activeScore.device === "MOBILE" ? "info" : "success"}>
                          {activeScore.device}
                        </Badge>
                      </BlockStack>
                    </Layout.Section>
                    <Layout.Section>
                      <InlineStack gap="400" wrap>
                        <MetricCard label="LCP" value={activeScore.lcp} unit="ms"
                          status={cwvStatus("lcp", activeScore.lcp)} good={2500} poor={4000}
                          tooltip="Largest Contentful Paint — target < 2.5s" />
                        <MetricCard label="INP" value={activeScore.inp} unit="ms"
                          status={cwvStatus("inp", activeScore.inp)} good={200} poor={500}
                          tooltip="Interaction to Next Paint — target < 200ms" />
                        <MetricCard label="CLS" value={activeScore.cls != null ? activeScore.cls / 1000 : null} unit=""
                          status={cwvStatus("cls", activeScore.cls)} good={0.1} poor={0.25}
                          tooltip="Cumulative Layout Shift — target < 0.1" isDecimal />
                        <MetricCard label="FCP" value={activeScore.fcp} unit="ms"
                          status={cwvStatus("fcp", activeScore.fcp)} good={1800} poor={3000}
                          tooltip="First Contentful Paint — target < 1.8s" />
                        <MetricCard label="TTFB" value={activeScore.ttfb} unit="ms"
                          status={cwvStatus("ttfb", activeScore.ttfb)} good={800} poor={1800}
                          tooltip="Time to First Byte — target < 800ms" />
                      </InlineStack>
                    </Layout.Section>
                  </Layout>
                )}

                {/* ─── PSI Scanner ─── */}
                {selectedTab === 1 && (
                  <>
                    <Divider />
                    <fetcher.Form method="POST">
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">Run PageSpeed Insights Scan</Text>
                        <InlineStack gap="300" blockAlign="end">
                          <div style={{ flex: 1 }}>
                            <input
                              name="url"
                              defaultValue={psiUrl}
                              onChange={(e) => setPsiUrl(e.target.value)}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                border: "2px solid #e2e8f0",
                                borderRadius: "8px",
                                fontSize: "14px",
                                boxSizing: "border-box",
                              }}
                              placeholder="https://your-store.myshopify.com/"
                            />
                          </div>
                          <Select
                            label=""
                            labelHidden
                            name="strategy"
                            options={[
                              { label: "Mobile", value: "mobile" },
                              { label: "Desktop", value: "desktop" },
                            ]}
                          />
                          <input type="hidden" name="intent" value="run_psi" />
                          <Button submit loading={isRunning} variant="primary">
                            Run Scan
                          </Button>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Uses Google PageSpeed Insights API. Results appear in ~30 seconds.
                        </Text>
                      </BlockStack>
                    </fetcher.Form>
                  </>
                )}
              </BlockStack>
            </Card>
          )}

          {/* ─── History Table ─── */}
          {selectedTab === 2 && (
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Score History (last {filter.days} days)</Text>
                {history.length === 0 ? (
                  <Banner tone="info">No history yet. Scores are collected via RUM and PSI scans.</Banner>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "numeric", "text", "text", "text"]}
                    headings={["Date", "URL", "Source", "Score", "LCP", "CLS", "INP"]}
                    rows={historyRows}
                    truncate
                  />
                )}
              </BlockStack>
            </Card>
          )}

          {/* ─── Per-URL Breakdown ─── */}
          {selectedTab === 3 && (
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Per-URL Performance</Text>
                {urlBreakdown.length === 0 ? (
                  <Banner tone="info">No URL data yet.</Banner>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "numeric", "text", "text", "text", "numeric"]}
                    headings={["URL", "Avg Score", "Avg LCP", "Avg CLS", "Avg INP", "Samples"]}
                    rows={urlRows}
                    truncate
                  />
                )}
              </BlockStack>
            </Card>
          )}
        </Tabs>
      </BlockStack>
    </Page>
  );
}
