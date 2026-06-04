import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144947635
// Replace the `remix` export with a custom plugin that has the same API
// but does not throw during ESM->CJS compilation
const isStorybook = process.argv[1]?.includes("storybook");

export default defineConfig({
  server: {
    port: Number(process.env.PORT ?? 3000),
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 64999,
    },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: false,
        v3_lazyRouteDiscovery: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/polaris"],
  },
}) satisfies UserConfig;
