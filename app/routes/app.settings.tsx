import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Divider,
  Banner,
  Select,
  TextField,
  Badge,
  Checkbox,
  ChoiceList,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { ToggleRow } from "../components/ToggleRow";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
    include: { settings: true },
  });

  if (!shop?.settings) {
    throw new Response("Settings not found", { status: 404 });
  }

  return json({ settings: shop.settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  const boolField = (key: string) => formData.get(key) === "true";
  const intField = (key: string, fallback: number) => {
    const v = formData.get(key);
    return v ? parseInt(String(v), 10) : fallback;
  };
  const strField = (key: string, fallback: string) => String(formData.get(key) ?? fallback);

  await db.optimizationSettings.update({
    where: { shopId: shop.id },
    data: {
      // Caching
      fullPageCacheEnabled: boolField("fullPageCacheEnabled"),
      browserCacheTtl: intField("browserCacheTtl", 3600),
      cacheWarmingEnabled: boolField("cacheWarmingEnabled"),
      // JavaScript
      deferJsEnabled: boolField("deferJsEnabled"),
      delayThirdPartyJs: boolField("delayThirdPartyJs"),
      delayTrigger: strField("delayTrigger", "interaction"),
      // CSS
      minifyCssEnabled: boolField("minifyCssEnabled"),
      criticalCssEnabled: boolField("criticalCssEnabled"),
      removeUnusedCss: boolField("removeUnusedCss"),
      // Images
      lazyLoadImages: boolField("lazyLoadImages"),
      webpEnabled: boolField("webpEnabled"),
      lcpPreloadEnabled: boolField("lcpPreloadEnabled"),
      lcpPreloadUrl: strField("lcpPreloadUrl", "") || null,
      // Fonts
      fontDisplaySwap: boolField("fontDisplaySwap"),
      preloadFonts: boolField("preloadFonts"),
      // Preloading
      dnsPrefetchEnabled: boolField("dnsPrefetchEnabled"),
      preconnectEnabled: boolField("preconnectEnabled"),
      prefetchOnHover: boolField("prefetchOnHover"),
      // HTML
      minifyHtmlEnabled: boolField("minifyHtmlEnabled"),
    },
  });

  return json({ success: true, savedAt: new Date().toISOString() });
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [form, setForm] = useState({
    fullPageCacheEnabled: settings.fullPageCacheEnabled,
    browserCacheTtl: String(settings.browserCacheTtl),
    cacheWarmingEnabled: settings.cacheWarmingEnabled,
    deferJsEnabled: settings.deferJsEnabled,
    delayThirdPartyJs: settings.delayThirdPartyJs,
    delayTrigger: settings.delayTrigger,
    minifyCssEnabled: settings.minifyCssEnabled,
    criticalCssEnabled: settings.criticalCssEnabled,
    removeUnusedCss: settings.removeUnusedCss,
    lazyLoadImages: settings.lazyLoadImages,
    webpEnabled: settings.webpEnabled,
    lcpPreloadEnabled: settings.lcpPreloadEnabled,
    lcpPreloadUrl: settings.lcpPreloadUrl ?? "",
    fontDisplaySwap: settings.fontDisplaySwap,
    preloadFonts: settings.preloadFonts,
    dnsPrefetchEnabled: settings.dnsPrefetchEnabled,
    preconnectEnabled: settings.preconnectEnabled,
    prefetchOnHover: settings.prefetchOnHover,
    minifyHtmlEnabled: settings.minifyHtmlEnabled,
  });

  const toggle = (key: keyof typeof form) => {
    setForm((f) => ({ ...f, [key]: !f[key] }));
  };

  const handleSave = () => {
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      data[k] = String(v);
    }
    submit(data, { method: "POST" });
  };

  const ttlOptions = [
    { label: "30 minutes", value: "1800" },
    { label: "1 hour", value: "3600" },
    { label: "4 hours", value: "14400" },
    { label: "12 hours", value: "43200" },
    { label: "24 hours", value: "86400" },
  ];

  const triggerOptions = [
    { label: "First interaction (scroll, click, keypress)", value: "interaction" },
    { label: "Page scroll", value: "scroll" },
    { label: "Browser idle (requestIdleCallback)", value: "idle" },
  ];

  return (
    <Page
      title="Optimization Settings"
      primaryAction={{ content: isSaving ? "Saving..." : "Save Settings", onAction: handleSave, loading: isSaving }}
    >
      <BlockStack gap="500">

        {/* ─── Caching ─── */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">Caching</Text>
              <Badge tone={form.fullPageCacheEnabled ? "success" : "attention"}>
                {form.fullPageCacheEnabled ? "Active" : "Disabled"}
              </Badge>
            </InlineStack>
            <Divider />
            <ToggleRow
              label="Full-Page HTML Cache"
              description="Cache complete HTML responses at the edge. Dramatically reduces TTFB."
              checked={form.fullPageCacheEnabled}
              onChange={() => toggle("fullPageCacheEnabled")}
            />
            <ToggleRow
              label="Cache Warming"
              description="Automatically pre-generate cache after theme publish or product updates."
              checked={form.cacheWarmingEnabled}
              onChange={() => toggle("cacheWarmingEnabled")}
              disabled={!form.fullPageCacheEnabled}
            />
            <Select
              label="Browser Cache TTL"
              options={ttlOptions}
              value={form.browserCacheTtl}
              onChange={(v) => setForm((f) => ({ ...f, browserCacheTtl: v }))}
              disabled={!form.fullPageCacheEnabled}
            />
          </BlockStack>
        </Card>

        {/* ─── JavaScript ─── */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">JavaScript Optimization</Text>
              <Badge tone={(form.deferJsEnabled || form.delayThirdPartyJs) ? "success" : "attention"}>
                {(form.deferJsEnabled || form.delayThirdPartyJs) ? "Active" : "Disabled"}
              </Badge>
            </InlineStack>
            <Divider />
            <ToggleRow
              label="Defer Non-Critical JavaScript"
              description="Add defer attribute to non-critical scripts. Eliminates render-blocking JS."
              checked={form.deferJsEnabled}
              onChange={() => toggle("deferJsEnabled")}
            />
            <ToggleRow
              label="Delay Third-Party Scripts"
              description="Delay analytics, chat widgets, and pixels until user interaction. Saves 200-800ms on LCP."
              checked={form.delayThirdPartyJs}
              onChange={() => toggle("delayThirdPartyJs")}
            />
            {form.delayThirdPartyJs && (
              <Select
                label="Delay Trigger"
                options={triggerOptions}
                value={form.delayTrigger}
                onChange={(v) => setForm((f) => ({ ...f, delayTrigger: v }))}
                helpText="When to load delayed scripts. 'First interaction' is recommended."
              />
            )}
          </BlockStack>
        </Card>

        {/* ─── CSS ─── */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">CSS Optimization</Text>
              <Badge tone={(form.minifyCssEnabled || form.criticalCssEnabled) ? "success" : "attention"}>
                {(form.minifyCssEnabled || form.criticalCssEnabled) ? "Active" : "Disabled"}
              </Badge>
            </InlineStack>
            <Divider />
            <ToggleRow
              label="Minify CSS"
              description="Remove whitespace and comments from CSS files. Reduces payload by 15-30%."
              checked={form.minifyCssEnabled}
              onChange={() => toggle("minifyCssEnabled")}
            />
            <ToggleRow
              label="Critical CSS Extraction"
              description="Inline above-the-fold CSS in the <head>. Eliminates render-blocking stylesheets."
              checked={form.criticalCssEnabled}
              onChange={() => toggle("criticalCssEnabled")}
            />
            <ToggleRow
              label="Remove Unused CSS"
              description="Scan and purge CSS rules not used on any page. Advanced — test thoroughly."
              checked={form.removeUnusedCss}
              onChange={() => toggle("removeUnusedCss")}
            />
          </BlockStack>
        </Card>

        {/* ─── Images ─── */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">Image Optimization</Text>
              <Badge tone={form.lazyLoadImages ? "success" : "attention"}>
                {form.lazyLoadImages ? "Active" : "Disabled"}
              </Badge>
            </InlineStack>
            <Divider />
            <ToggleRow
              label="Lazy Load Images"
              description="Add loading='lazy' to all off-screen images. Reduces initial page weight."
              checked={form.lazyLoadImages}
              onChange={() => toggle("lazyLoadImages")}
            />
            <ToggleRow
              label="Recommend WebP / AVIF"
              description="Flag images not served as WebP or AVIF for merchant action."
              checked={form.webpEnabled}
              onChange={() => toggle("webpEnabled")}
            />
            <ToggleRow
              label="LCP Image Preload"
              description="Inject <link rel='preload'> for the hero/LCP image. Biggest single LCP win."
              checked={form.lcpPreloadEnabled}
              onChange={() => toggle("lcpPreloadEnabled")}
            />
            {form.lcpPreloadEnabled && (
              <TextField
                label="LCP Image URL"
                value={form.lcpPreloadUrl}
                onChange={(v) => setForm((f) => ({ ...f, lcpPreloadUrl: v }))}
                placeholder="https://cdn.shopify.com/s/files/.../hero.jpg"
                helpText="Leave blank to auto-detect. Set manually for precision."
                autoComplete="off"
              />
            )}
          </BlockStack>
        </Card>

        {/* ─── Fonts ─── */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Font Optimization</Text>
            <Divider />
            <ToggleRow
              label="font-display: swap"
              description="Inject font-display: swap for all @font-face rules. Prevents invisible text during load."
              checked={form.fontDisplaySwap}
              onChange={() => toggle("fontDisplaySwap")}
            />
            <ToggleRow
              label="Preload Critical Fonts"
              description="Inject <link rel='preload'> for fonts used above the fold."
              checked={form.preloadFonts}
              onChange={() => toggle("preloadFonts")}
            />
          </BlockStack>
        </Card>

        {/* ─── Preloading ─── */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Preloading & Prefetching</Text>
            <Divider />
            <ToggleRow
              label="DNS Prefetch"
              description="Inject <link rel='dns-prefetch'> for known third-party origins."
              checked={form.dnsPrefetchEnabled}
              onChange={() => toggle("dnsPrefetchEnabled")}
            />
            <ToggleRow
              label="Preconnect"
              description="Inject <link rel='preconnect'> for critical origins (Shopify CDN, Google Fonts)."
              checked={form.preconnectEnabled}
              onChange={() => toggle("preconnectEnabled")}
            />
            <ToggleRow
              label="Prefetch on Hover"
              description="Prefetch page resources when user hovers a link (like instant.page). Perceived navigation speed +40%."
              checked={form.prefetchOnHover}
              onChange={() => toggle("prefetchOnHover")}
            />
          </BlockStack>
        </Card>

        {/* ─── Advanced ─── */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Advanced</Text>
            <Divider />
            <ToggleRow
              label="Minify HTML Output"
              description="Remove HTML whitespace and comments. Small gain — test with your theme first."
              checked={form.minifyHtmlEnabled}
              onChange={() => toggle("minifyHtmlEnabled")}
            />
          </BlockStack>
        </Card>

        <InlineStack align="end">
          <Button variant="primary" onClick={handleSave} loading={isSaving} size="large">
            {isSaving ? "Saving..." : "Save All Settings"}
          </Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}
