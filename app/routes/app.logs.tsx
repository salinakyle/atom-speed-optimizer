import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  DataTable,
  Badge,
  Banner,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) throw new Response("Not found", { status: 404 });

  const logs = await db.optimizationLog.findMany({
    where: { shopId: shop.id },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return json({ logs });
};

const statusTone: Record<string, "success" | "critical" | "attention" | "info"> = {
  SUCCESS: "success",
  FAILED: "critical",
  RUNNING: "attention",
  PENDING: "info",
};

export default function LogsPage() {
  const { logs } = useLoaderData<typeof loader>();

  const rows = logs.map((log) => [
    log.action.replace(/_/g, " "),
    <Badge tone={statusTone[log.status] ?? "info"}>{log.status}</Badge>,
    log.error ?? "—",
    new Date(log.startedAt).toLocaleString(),
    log.finishedAt ? new Date(log.finishedAt).toLocaleString() : "—",
  ]);

  return (
    <Page title="Activity Logs" subtitle="All optimization events and background jobs">
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Recent Events ({logs.length})</Text>
            <Divider />
            {logs.length === 0 ? (
              <Banner tone="info">No activity yet. Events are logged as optimizations run.</Banner>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["Action", "Status", "Error", "Started", "Finished"]}
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
