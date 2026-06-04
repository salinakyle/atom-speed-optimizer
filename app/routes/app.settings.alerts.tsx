import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  DataTable,
  Badge,
  Banner,
  Modal,
  Select,
  TextField,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) throw new Response("Not found", { status: 404 });

  const thresholds = await db.alertThreshold.findMany({
    where: { shopId: shop.id },
    orderBy: { metric: "asc" },
  });

  return json({ thresholds });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  switch (intent) {
    case "create": {
      await db.alertThreshold.create({
        data: {
          shopId: shop.id,
          metric: String(formData.get("metric")),
          operator: String(formData.get("operator")),
          value: parseFloat(String(formData.get("value"))),
        },
      });
      return json({ success: true, message: "Alert created." });
    }
    case "toggle": {
      const id = String(formData.get("id"));
      const current = await db.alertThreshold.findUnique({ where: { id } });
      if (!current || current.shopId !== shop.id) return json({ error: "Not found" }, { status: 404 });
      await db.alertThreshold.update({ where: { id }, data: { enabled: !current.enabled } });
      return json({ success: true });
    }
    case "delete": {
      const id = String(formData.get("id"));
      const item = await db.alertThreshold.findUnique({ where: { id } });
      if (!item || item.shopId !== shop.id) return json({ error: "Not found" }, { status: 404 });
      await db.alertThreshold.delete({ where: { id } });
      return json({ success: true });
    }
    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
};

const METRIC_OPTIONS = [
  { label: "LCP (ms)", value: "lcp" },
  { label: "INP (ms)", value: "inp" },
  { label: "CLS (×1000)", value: "cls" },
  { label: "FCP (ms)", value: "fcp" },
  { label: "TTFB (ms)", value: "ttfb" },
  { label: "Overall Score", value: "score" },
];

const OPERATOR_OPTIONS = [
  { label: "greater than (worse than)", value: "gt" },
  { label: "less than (better than)", value: "lt" },
];

const METRIC_DEFAULTS: Record<string, { operator: string; value: string }> = {
  lcp: { operator: "gt", value: "4000" },
  inp: { operator: "gt", value: "500" },
  cls: { operator: "gt", value: "250" },
  fcp: { operator: "gt", value: "3000" },
  ttfb: { operator: "gt", value: "1800" },
  score: { operator: "lt", value: "50" },
};

export default function AlertsPage() {
  const { thresholds } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ metric: "lcp", operator: "gt", value: "4000" });

  const metricLabels: Record<string, string> = Object.fromEntries(
    METRIC_OPTIONS.map((o) => [o.value, o.label])
  );

  const rows = thresholds.map((t) => [
    metricLabels[t.metric] ?? t.metric,
    t.operator === "gt" ? "greater than" : "less than",
    String(t.value),
    <Badge tone={t.enabled ? "success" : "critical"}>{t.enabled ? "Active" : "Paused"}</Badge>,
    <InlineStack gap="200">
      <Button
        size="slim"
        onClick={() => fetcher.submit({ intent: "toggle", id: t.id }, { method: "POST" })}
      >
        {t.enabled ? "Disable" : "Enable"}
      </Button>
      <Button
        size="slim"
        tone="critical"
        onClick={() => fetcher.submit({ intent: "delete", id: t.id }, { method: "POST" })}
      >
        Delete
      </Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title="Alert Thresholds"
      subtitle="Get notified in Activity Logs when Core Web Vitals degrade"
      primaryAction={{ content: "Add Alert", onAction: () => setShowModal(true) }}
      breadcrumbs={[{ content: "Settings", url: "/app/settings" }]}
    >
      <BlockStack gap="500">
        {fetcher.data && "message" in fetcher.data && (
          <Banner tone="success">{(fetcher.data as { message: string }).message}</Banner>
        )}

        <Banner tone="info">
          Alerts are recorded in Activity Logs and will support email/Slack notifications in a future release.
        </Banner>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Active Alerts ({thresholds.length})</Text>
            <Divider />
            {thresholds.length === 0 ? (
              <Banner tone="info">No alert thresholds set. Add one to start monitoring CWV degradation.</Banner>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "numeric", "text", "text"]}
                headings={["Metric", "Condition", "Value", "Status", "Actions"]}
                rows={rows}
              />
            )}
          </BlockStack>
        </Card>

        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title="Add Alert Threshold"
          primaryAction={{
            content: "Add Alert",
            onAction: () => {
              fetcher.submit({ intent: "create", ...form }, { method: "POST" });
              setShowModal(false);
            },
          }}
          secondaryActions={[{ content: "Cancel", onAction: () => setShowModal(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Select
                label="Metric"
                options={METRIC_OPTIONS}
                value={form.metric}
                onChange={(v) => {
                  const defaults = METRIC_DEFAULTS[v] ?? { operator: "gt", value: "1000" };
                  setForm({ metric: v, ...defaults });
                }}
              />
              <Select
                label="Condition"
                options={OPERATOR_OPTIONS}
                value={form.operator}
                onChange={(v) => setForm((f) => ({ ...f, operator: v }))}
              />
              <TextField
                label="Threshold Value"
                type="number"
                value={form.value}
                onChange={(v) => setForm((f) => ({ ...f, value: v }))}
                helpText={
                  form.metric === "lcp" ? "In milliseconds. Good: <2500, Poor: >4000"
                  : form.metric === "cls" ? "Scaled by 1000. Good: <100, Poor: >250"
                  : form.metric === "score" ? "0–100. Good: >90, Poor: <50"
                  : "In milliseconds."
                }
                autoComplete="off"
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}
