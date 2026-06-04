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
  TextField,
  Select,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) throw new Response("Not found", { status: 404 });

  const rules = await db.scriptRule.findMany({
    where: { shopId: shop.id },
    orderBy: [{ isPreset: "desc" }, { name: "asc" }],
  });

  return json({ rules, shopId: shop.id });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  switch (intent) {
    case "toggle": {
      const id = String(formData.get("id"));
      const current = await db.scriptRule.findUnique({ where: { id } });
      if (!current || current.shopId !== shop.id) return json({ error: "Not found" }, { status: 404 });
      await db.scriptRule.update({ where: { id }, data: { enabled: !current.enabled } });
      return json({ success: true });
    }
    case "create": {
      await db.scriptRule.create({
        data: {
          shopId: shop.id,
          name: String(formData.get("name")),
          pattern: String(formData.get("pattern")),
          action: "DELAY" as const,
          trigger: (String(formData.get("trigger")) as "INTERACTION" | "SCROLL" | "IDLE") ?? "INTERACTION",
          isPreset: false,
        },
      });
      return json({ success: true, message: "Rule created." });
    }
    case "delete": {
      const id = String(formData.get("id"));
      const rule = await db.scriptRule.findUnique({ where: { id } });
      if (!rule || rule.shopId !== shop.id || rule.isPreset) {
        return json({ error: "Cannot delete a built-in preset" }, { status: 400 });
      }
      await db.scriptRule.delete({ where: { id } });
      return json({ success: true });
    }
    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
};

export default function ScriptsPage() {
  const { rules } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [showModal, setShowModal] = useState(false);
  const [newRule, setNewRule] = useState({ name: "", pattern: "", trigger: "INTERACTION" });

  const triggerLabels: Record<string, string> = {
    INTERACTION: "First interaction",
    SCROLL: "Page scroll",
    IDLE: "Browser idle",
    TIMER: "5s timer",
  };

  const rows = rules.map((r) => [
    <InlineStack gap="200">
      <Text as="span" variant="bodyMd">{r.name}</Text>
      {r.isPreset && <Badge tone="info">Preset</Badge>}
    </InlineStack>,
    <Text as="span" variant="bodySm" tone="subdued" breakWord>{r.pattern}</Text>,
    triggerLabels[r.trigger] ?? r.trigger,
    <Badge tone={r.enabled ? "success" : "critical"}>{r.enabled ? "Active" : "Paused"}</Badge>,
    <InlineStack gap="200">
      <Button
        size="slim"
        onClick={() => fetcher.submit({ intent: "toggle", id: r.id }, { method: "POST" })}
      >
        {r.enabled ? "Disable" : "Enable"}
      </Button>
      {!r.isPreset && (
        <Button
          size="slim"
          tone="critical"
          onClick={() => fetcher.submit({ intent: "delete", id: r.id }, { method: "POST" })}
        >
          Delete
        </Button>
      )}
    </InlineStack>,
  ]);

  return (
    <Page
      title="Script Manager"
      subtitle="Delay or block third-party scripts until user interaction"
      primaryAction={{
        content: "Add Custom Rule",
        onAction: () => setShowModal(true),
      }}
    >
      <BlockStack gap="500">
        {fetcher.data && "message" in fetcher.data && (
          <Banner tone="success">{(fetcher.data as { message: string }).message}</Banner>
        )}
        {fetcher.data && "error" in fetcher.data && (
          <Banner tone="critical">{(fetcher.data as { error: string }).error}</Banner>
        )}

        <Banner tone="info">
          Delaying analytics and chat scripts until first user interaction typically saves
          200–600ms on LCP with zero functional impact.
        </Banner>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Script Rules ({rules.length})</Text>
            <Divider />
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text"]}
              headings={["Script Name", "URL Pattern", "Load Trigger", "Status", "Actions"]}
              rows={rows}
            />
          </BlockStack>
        </Card>

        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title="Add Custom Script Rule"
          primaryAction={{
            content: "Add Rule",
            onAction: () => {
              fetcher.submit(
                { intent: "create", ...newRule },
                { method: "POST" }
              );
              setShowModal(false);
            },
          }}
          secondaryActions={[{ content: "Cancel", onAction: () => setShowModal(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <TextField
                label="Script Name"
                value={newRule.name}
                onChange={(v) => setNewRule((f) => ({ ...f, name: v }))}
                placeholder="My Analytics Script"
                autoComplete="off"
              />
              <TextField
                label="URL Pattern (substring match)"
                value={newRule.pattern}
                onChange={(v) => setNewRule((f) => ({ ...f, pattern: v }))}
                placeholder="analytics.myapp.com/"
                helpText="Any script whose src contains this string will be delayed."
                autoComplete="off"
              />
              <Select
                label="Load Trigger"
                value={newRule.trigger}
                onChange={(v) => setNewRule((f) => ({ ...f, trigger: v }))}
                options={[
                  { label: "First interaction (recommended)", value: "INTERACTION" },
                  { label: "Page scroll", value: "SCROLL" },
                  { label: "Browser idle", value: "IDLE" },
                ]}
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}
