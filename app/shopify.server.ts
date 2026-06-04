import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { db } from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.October24,
  scopes: process.env.SCOPES?.split(",") ?? [
    "write_script_tags",
    "read_script_tags",
    "write_themes",
    "read_themes",
    "write_products",
    "read_products",
    "read_orders",
    "read_analytics",
  ],
  appUrl: process.env.SHOPIFY_APP_URL!,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(db),
  distribution: AppDistribution.AppStore,
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    THEMES_PUBLISH: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    PRODUCTS_UPDATE: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    COLLECTIONS_UPDATE: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      await shopify.registerWebhooks({ session });

      // Upsert shop record on every install / re-auth
      await db.shop.upsert({
        where: { domain: session.shop },
        create: {
          domain: session.shop,
          accessToken: session.accessToken,
          settings: {
            create: {}, // creates OptimizationSettings with all defaults
          },
          scriptRules: {
            createMany: {
              data: DEFAULT_SCRIPT_PRESETS.map((p) => ({
                ...p,
                isPreset: true,
              })),
            },
          },
          alertThresholds: {
            createMany: {
              data: [
                { metric: "lcp", operator: "gt", value: 4000 },
                { metric: "cls", operator: "gt", value: 250 },
                { metric: "inp", operator: "gt", value: 500 },
                { metric: "score", operator: "lt", value: 50 },
              ],
            },
          },
        },
        update: {
          accessToken: session.accessToken,
          uninstalledAt: null,
        },
      });
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

// Default presets used above and exported for reuse elsewhere
export const DEFAULT_SCRIPT_PRESETS = [
  { name: "Google Analytics", pattern: "google-analytics.com/analytics.js", action: "DELAY" as const, trigger: "INTERACTION" as const },
  { name: "Google Tag Manager", pattern: "googletagmanager.com/gtm.js", action: "DELAY" as const, trigger: "INTERACTION" as const },
  { name: "Facebook Pixel", pattern: "connect.facebook.net/", action: "DELAY" as const, trigger: "INTERACTION" as const },
  { name: "TikTok Pixel", pattern: "analytics.tiktok.com/", action: "DELAY" as const, trigger: "INTERACTION" as const },
  { name: "Hotjar", pattern: "static.hotjar.com/", action: "DELAY" as const, trigger: "IDLE" as const },
  { name: "Intercom", pattern: "widget.intercom.io/", action: "DELAY" as const, trigger: "INTERACTION" as const },
  { name: "Zendesk Chat", pattern: "static.zdassets.com/", action: "DELAY" as const, trigger: "INTERACTION" as const },
  { name: "Klaviyo", pattern: "static.klaviyo.com/", action: "DELAY" as const, trigger: "SCROLL" as const },
  { name: "Yotpo Reviews", pattern: "staticw2.yotpo.com/", action: "DELAY" as const, trigger: "SCROLL" as const },
  { name: "Gorgias Chat", pattern: "config.gorgias.chat/", action: "DELAY" as const, trigger: "INTERACTION" as const },
];
