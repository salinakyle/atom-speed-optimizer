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
  Badge,
  Banner,
  Divider,
  DataTable,
  ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
    include: { settings: true },
  });
  if (!shop) throw new Response("Not found", { status: 404 });

  // Fetch product images via GraphQL to analyze format compliance
  const response = await admin.graphql(`
    #graphql
    query GetProductImages($first: Int!) {
      products(first: $first) {
        nodes {
          id
          title
          featuredImage {
            url
            altText
            width
            height
          }
          images(first: 5) {
            nodes {
              url
              altText
              width
              height
            }
          }
        }
      }
    }
  `, { variables: { first: 50 } });

  const data = await response.json() as {
    data?: {
      products?: {
        nodes?: Array<{
          id: string;
          title: string;
          featuredImage?: { url: string; altText?: string; width?: number; height?: number };
          images: { nodes: Array<{ url: string; altText?: string; width?: number; height?: number }> };
        }>;
      };
    };
  };

  const products = data?.data?.products?.nodes ?? [];

  // Analyze images: flag non-WebP, missing alt text, large dimensions
  type ImageIssue = {
    productTitle: string;
    imageUrl: string;
    isWebP: boolean;
    hasAlt: boolean;
    width: number | null;
    height: number | null;
    issues: string[];
  };
  const imageIssues: ImageIssue[] = [];

  for (const product of products) {
    const allImages = [
      product.featuredImage,
      ...product.images.nodes,
    ].filter(Boolean);

    for (const img of allImages) {
      if (!img) continue;
      const issues: string[] = [];
      const isWebP = img.url.includes(".webp") || img.url.includes("format=webp");
      const hasAlt = Boolean(img.altText);
      const width = img.width ?? null;
      const height = img.height ?? null;

      if (!isWebP) issues.push("Not WebP/AVIF");
      if (!hasAlt) issues.push("Missing alt text");
      if (width && width > 2000) issues.push(`Oversized (${width}px wide)`);

      if (issues.length > 0) {
        imageIssues.push({
          productTitle: product.title,
          imageUrl: img.url,
          isWebP,
          hasAlt,
          width,
          height,
          issues,
        });
      }
    }
  }

  const totalImages = products.reduce((sum, p) => sum + 1 + p.images.nodes.length, 0);
  const webpCount = products.reduce((sum, p) => {
    const imgs = [p.featuredImage, ...p.images.nodes].filter(Boolean);
    return sum + imgs.filter((i) => i?.url.includes(".webp") || i?.url.includes("format=webp")).length;
  }, 0);

  return json({
    imageIssues: imageIssues.slice(0, 30),
    totalImages,
    webpCount,
    settings: shop.settings,
    shopDomain: session.shop,
  });
};

export default function ImagesPage() {
  const { imageIssues, totalImages, webpCount, settings } = useLoaderData<typeof loader>();

  const webpPct = totalImages > 0 ? Math.round((webpCount / totalImages) * 100) : 0;
  const issueCount = imageIssues.length;

  const rows = imageIssues.slice(0, 20).map((img) => [
    img.productTitle,
    <a href={img.imageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2c6ecb" }}>
      {img.imageUrl.split("/").pop()?.split("?")[0] ?? "image"}
    </a>,
    <InlineStack gap="100" wrap>
      {img.issues.map((issue) => (
        <Badge key={issue} tone="critical">{issue}</Badge>
      ))}
    </InlineStack>,
    img.width ? `${img.width} × ${img.height}` : "—",
  ]);

  return (
    <Page title="Image Optimizer" subtitle="Identify and fix image performance issues">
      <BlockStack gap="500">
        <Banner tone="info">
          Shopify CDN automatically serves WebP when the browser supports it for images using
          <code>?format=webp</code>. The issues below flag images that may not be leveraging
          Shopify's CDN transforms correctly.
        </Banner>

        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">WebP Coverage</Text>
                <Divider />
                <Text as="p" variant="headingLg">{webpPct}%</Text>
                <ProgressBar progress={webpPct} tone={webpPct >= 80 ? "success" : webpPct >= 50 ? "highlight" : "critical"} />
                <Text as="p" variant="bodySm" tone="subdued">
                  {webpCount} of {totalImages} images served as WebP/AVIF
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Images Analyzed</Text>
                <Divider />
                <Text as="p" variant="headingLg">{totalImages}</Text>
                <Text as="p" variant="bodySm" tone="subdued">across first 50 products</Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Issues Found</Text>
                <Divider />
                <Text as="p" variant="headingLg">
                  <span style={{ color: issueCount > 0 ? "#d72c0d" : "#00a47c" }}>
                    {issueCount}
                  </span>
                </Text>
                <Badge tone={issueCount === 0 ? "success" : "critical"}>
                  {issueCount === 0 ? "All Clear" : `${issueCount} images need attention`}
                </Badge>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">Image Issues</Text>
              <Text as="p" variant="bodySm" tone="subdued">Showing top 20</Text>
            </InlineStack>
            <Divider />
            {imageIssues.length === 0 ? (
              <Banner tone="success">
                No image issues detected. All product images are optimized.
              </Banner>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Product", "Image", "Issues", "Dimensions"]}
                rows={rows}
                truncate
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Active Image Settings</Text>
            <Divider />
            <InlineStack align="space-between">
              <Text as="p">Lazy Load Images</Text>
              <Badge tone={settings?.lazyLoadImages ? "success" : "critical"}>
                {settings?.lazyLoadImages ? "ON" : "OFF"}
              </Badge>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="p">LCP Hero Preload</Text>
              <Badge tone={settings?.lcpPreloadEnabled ? "success" : "critical"}>
                {settings?.lcpPreloadEnabled ? "ON" : "OFF"}
              </Badge>
            </InlineStack>
            {settings?.lcpPreloadUrl && (
              <Text as="p" variant="bodySm" tone="subdued">
                Preloading: {settings.lcpPreloadUrl}
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
