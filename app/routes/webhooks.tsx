import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { queueCacheWarm } from "../queues/jobs.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED": {
      await handleUninstall(shop);
      break;
    }
    case "THEMES_PUBLISH": {
      await handleThemePublish(shop, payload);
      break;
    }
    case "PRODUCTS_UPDATE": {
      await handleProductUpdate(shop, payload);
      break;
    }
    case "COLLECTIONS_UPDATE": {
      await handleCollectionUpdate(shop, payload);
      break;
    }
    default:
      console.warn(`Unhandled webhook topic: ${topic} for shop ${shop}`);
  }

  return new Response(null, { status: 200 });
};

async function handleUninstall(shopDomain: string) {
  await db.shop.update({
    where: { domain: shopDomain },
    data: { uninstalledAt: new Date() },
  });

  // Log the uninstall event
  const shopRecord = await db.shop.findUnique({ where: { domain: shopDomain } });
  if (shopRecord) {
    await db.optimizationLog.create({
      data: {
        shopId: shopRecord.id,
        action: "app_uninstalled",
        status: "SUCCESS",
        details: { shopDomain, uninstalledAt: new Date().toISOString() },
        finishedAt: new Date(),
      },
    });
  }
}

async function handleThemePublish(shopDomain: string, payload: unknown) {
  const shopRecord = await db.shop.findUnique({
    where: { domain: shopDomain },
    include: { settings: true },
  });

  if (!shopRecord?.settings?.cacheWarmingEnabled) return;

  // Purge all cache entries for this shop since theme changed
  await db.cacheEntry.deleteMany({ where: { shopId: shopRecord.id } });

  // Queue a fresh cache warm job
  await queueCacheWarm({
    shopId: shopRecord.id,
    shopDomain,
    reason: "theme_publish",
    payload: payload as Record<string, unknown>,
  });

  await db.optimizationLog.create({
    data: {
      shopId: shopRecord.id,
      action: "cache_purge_theme_publish",
      status: "SUCCESS",
      details: { reason: "theme_publish" },
      finishedAt: new Date(),
    },
  });
}

async function handleProductUpdate(shopDomain: string, payload: unknown) {
  const shopRecord = await db.shop.findUnique({
    where: { domain: shopDomain },
    include: { settings: true },
  });

  if (!shopRecord?.settings?.cacheWarmingEnabled) return;

  const typedPayload = payload as { handle?: string };
  if (typedPayload?.handle) {
    // Invalidate only the product page cache entry
    const productUrl = `https://${shopDomain}/products/${typedPayload.handle}`;
    await db.cacheEntry.deleteMany({
      where: { shopId: shopRecord.id, url: productUrl },
    });
  }
}

async function handleCollectionUpdate(shopDomain: string, payload: unknown) {
  const shopRecord = await db.shop.findUnique({
    where: { domain: shopDomain },
    include: { settings: true },
  });

  if (!shopRecord?.settings?.cacheWarmingEnabled) return;

  const typedPayload = payload as { handle?: string };
  if (typedPayload?.handle) {
    const collectionUrl = `https://${shopDomain}/collections/${typedPayload.handle}`;
    await db.cacheEntry.deleteMany({
      where: { shopId: shopRecord.id, url: collectionUrl },
    });
  }
}
