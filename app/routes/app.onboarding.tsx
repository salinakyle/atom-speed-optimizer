import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Badge,
  Divider,
  Banner,
  ProgressBar,
  Layout,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { ScoreGauge } from "../components/ScoreGauge";
import { ToggleRow } from "../components/ToggleRow";
import { queuePSIScan } from "../queues/jobs.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
    include: { settings: true },
  });

  if (shop?.onboardingDone) {
    throw redirect("/app");
  }

  // Fetch the latest PSI score if one exists
  const latestScore = shop
    ? await db.performanceScore.findFirst({
        where: { shopId: shop.id, source: "PSI" },
        orderBy: { recordedAt: "desc" },
      })
    : null;

  return json({
    shopDomain: session.shop,
    shopId: shop?.id,
    settings: shop?.settings,
    latestScore,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
    include: { settings: true },
  });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  switch (intent) {
    case "scan": {
      await queuePSIScan({
        shopId: shop.id,
        shopDomain: session.shop,
        url: `https://${session.shop}/`,
        strategy: "mobile",
      });
      return json({ success: true, scanning: true });
    }

    case "save_quick_settings": {
      const boolField = (key: string) => formData.get(key) === "true";
      await db.optimizationSettings.update({
        where: { shopId: shop.id },
        data: {
          deferJsEnabled: boolField("deferJs"),
          delayThirdPartyJs: boolField("delayThirdParty"),
          lazyLoadImages: boolField("lazyImages"),
          criticalCssEnabled: boolField("criticalCss"),
          prefetchOnHover: boolField("prefetchHover"),
          lcpPreloadEnabled: boolField("lcpPreload"),
          cacheWarmingEnabled: true,
        },
      });
      return json({ success: true });
    }

    case "complete": {
      await db.shop.update({
        where: { id: shop.id },
        data: { onboardingDone: true },
      });
      throw redirect("/app");
    }

    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
};

const STEP_LABELS = [
  "Baseline Scan",
  "Quick Settings",
  "Install Extension",
];

export default function OnboardingPage() {
  const { shopDomain, latestScore } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [quickSettings, setQuickSettings] = useState({
    deferJs: true,
    delayThirdParty: true,
    lazyImages: true,
    criticalCss: true,
    prefetchHover: true,
    lcpPreload: false,
  });

  const toggle = (key: keyof typeof quickSettings) => {
    setQuickSettings((s) => ({ ...s, [key]: !s[key] }));
  };

  const progress = Math.round(((step + 1) / 3) * 100);
  const isBusy = fetcher.state !== "idle";
  const isScanning = isBusy && step === 0;

  return (
    <Page title="Welcome to Speed Optimizer ⚡">
      <BlockStack gap="600">
        {/* ─── Progress ─── */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                Step {step + 1} of 3 — {STEP_LABELS[step]}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">{progress}% complete</Text>
            </InlineStack>
            <ProgressBar progress={progress} tone="success" />
          </BlockStack>
        </Card>

        {/* ─── STEP 0: Baseline Scan ─── */}
        {step === 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Step 1: Measure Your Baseline Score</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Let's run a Google PageSpeed Insights scan on your homepage to see your current performance.
                    This takes about 30 seconds.
                  </Text>
                  <Divider />

                  {!latestScore && !isScanning && (
                    <fetcher.Form method="POST">
                      <input type="hidden" name="intent" value="scan" />
                      <BlockStack gap="300">
                        <Banner tone="info">
                          Scanning: <strong>{shopDomain}</strong>
                        </Banner>
                        <Button submit variant="primary" loading={isBusy}>
                          Run PageSpeed Scan
                        </Button>
                      </BlockStack>
                    </fetcher.Form>
                  )}

                  {isScanning && (
                    <BlockStack gap="300" align="center">
                      <Spinner />
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Scanning your store... this takes ~30 seconds. Results will appear after the background job completes.
                      </Text>
                    </BlockStack>
                  )}

                  {latestScore && (
                    <BlockStack gap="400">
                      <Banner tone={
                        (latestScore.score ?? 0) >= 90 ? "success"
                        : (latestScore.score ?? 0) >= 50 ? "warning"
                        : "critical"
                      }>
                        Your current PageSpeed score is <strong>{latestScore.score ?? "—"}/100</strong>.
                        {(latestScore.score ?? 0) < 50 && " There's significant room for improvement!"}
                        {(latestScore.score ?? 0) >= 90 && " Your store is already fast! Let's keep it that way."}
                      </Banner>
                      <InlineStack align="center">
                        <ScoreGauge score={latestScore.score} status={
                          (latestScore.score ?? 0) >= 90 ? "success"
                          : (latestScore.score ?? 0) >= 50 ? "warning"
                          : "critical"
                        } size={160} />
                      </InlineStack>
                      <Button variant="primary" onClick={() => setStep(1)}>
                        Next: Configure Optimizations →
                      </Button>
                    </BlockStack>
                  )}

                  {fetcher.data && "scanning" in fetcher.data && !latestScore && (
                    <Banner tone="info">
                      Scan queued! PageSpeed results will be ready in ~30 seconds.
                      Click "Next" to proceed while we collect your baseline.
                    </Banner>
                  )}

                  {fetcher.data && "scanning" in fetcher.data && (
                    <Button variant="secondary" onClick={() => setStep(1)}>
                      Next (scan in progress) →
                    </Button>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* ─── STEP 1: Quick Settings ─── */}
        {step === 1 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Step 2: Enable Recommended Optimizations</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                These settings are pre-selected based on what gives the biggest performance gains.
                All can be adjusted later in Settings.
              </Text>
              <Divider />

              <ToggleRow
                label="Defer Non-Critical JavaScript"
                description="Prevents render-blocking scripts from delaying your page load."
                checked={quickSettings.deferJs}
                onChange={() => toggle("deferJs")}
              />
              <ToggleRow
                label="Delay Third-Party Scripts"
                description="Loads analytics and chat widgets only after first user interaction."
                checked={quickSettings.delayThirdParty}
                onChange={() => toggle("delayThirdParty")}
              />
              <ToggleRow
                label="Lazy Load Images"
                description="Off-screen images load only when the visitor scrolls to them."
                checked={quickSettings.lazyImages}
                onChange={() => toggle("lazyImages")}
              />
              <ToggleRow
                label="Critical CSS Extraction"
                description="Inline above-the-fold styles for instant first paint."
                checked={quickSettings.criticalCss}
                onChange={() => toggle("criticalCss")}
              />
              <ToggleRow
                label="Prefetch Pages on Hover"
                description="Pre-loads pages when visitors hover links — navigation feels instant."
                checked={quickSettings.prefetchHover}
                onChange={() => toggle("prefetchHover")}
              />
              <ToggleRow
                label="Preload LCP Hero Image"
                description="Advanced: Preloads your largest above-fold image. Configure URL in Settings."
                checked={quickSettings.lcpPreload}
                onChange={() => toggle("lcpPreload")}
              />

              <Divider />
              <InlineStack align="space-between">
                <Button onClick={() => setStep(0)}>← Back</Button>
                <Button
                  variant="primary"
                  loading={isBusy}
                  onClick={() => {
                    const data: Record<string, string> = { intent: "save_quick_settings" };
                    for (const [k, v] of Object.entries(quickSettings)) {
                      data[k] = String(v);
                    }
                    fetcher.submit(data, { method: "POST" });
                    setTimeout(() => setStep(2), 500);
                  }}
                >
                  Save & Continue →
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* ─── STEP 2: Install Extension ─── */}
        {step === 2 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Step 3: Activate Theme Extension</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                The Speed Optimizer Theme Extension must be added to your theme to inject
                the optimization scripts and RUM beacon into your storefront.
              </Text>
              <Divider />

              <Banner tone="info">
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">How to activate:</Text>
                  <Text as="p" variant="bodyMd">
                    1. Go to <strong>Online Store → Themes → Customize</strong>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Click <strong>Add section</strong> → search "Speed Optimizer"
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Add to the <strong>&lt;head&gt; section</strong> and Save
                  </Text>
                </BlockStack>
              </Banner>

              <BlockStack gap="200">
                <InlineStack gap="200">
                  <Badge tone="success">✓</Badge>
                  <Text as="p">App installed and authorized</Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Badge tone="success">✓</Badge>
                  <Text as="p">Optimization settings configured</Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Badge tone="attention">→</Badge>
                  <Text as="p">Theme Extension activation (manual step)</Text>
                </InlineStack>
              </BlockStack>

              <Divider />
              <InlineStack align="space-between">
                <Button onClick={() => setStep(1)}>← Back</Button>
                <Button
                  variant="primary"
                  loading={isBusy}
                  onClick={() => fetcher.submit({ intent: "complete" }, { method: "POST" })}
                >
                  Complete Setup ✓
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
