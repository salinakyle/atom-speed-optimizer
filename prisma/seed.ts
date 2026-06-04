import { PrismaClient, ScriptAction, ScriptTrigger } from "@prisma/client";

const prisma = new PrismaClient();

// Default script delay presets — mirrors WP-Rocket's "Delay JS" list
const DEFAULT_SCRIPT_PRESETS = [
  { name: "Google Analytics", pattern: "google-analytics.com/analytics.js", action: ScriptAction.DELAY, trigger: ScriptTrigger.INTERACTION },
  { name: "Google Tag Manager", pattern: "googletagmanager.com/gtm.js", action: ScriptAction.DELAY, trigger: ScriptTrigger.INTERACTION },
  { name: "Facebook Pixel", pattern: "connect.facebook.net/", action: ScriptAction.DELAY, trigger: ScriptTrigger.INTERACTION },
  { name: "TikTok Pixel", pattern: "analytics.tiktok.com/", action: ScriptAction.DELAY, trigger: ScriptTrigger.INTERACTION },
  { name: "Hotjar", pattern: "static.hotjar.com/", action: ScriptAction.DELAY, trigger: ScriptTrigger.IDLE },
  { name: "Intercom", pattern: "widget.intercom.io/", action: ScriptAction.DELAY, trigger: ScriptTrigger.INTERACTION },
  { name: "Zendesk Chat", pattern: "static.zdassets.com/", action: ScriptAction.DELAY, trigger: ScriptTrigger.INTERACTION },
  { name: "Klaviyo", pattern: "static.klaviyo.com/", action: ScriptAction.DELAY, trigger: ScriptTrigger.SCROLL },
  { name: "Yotpo Reviews", pattern: "staticw2.yotpo.com/", action: ScriptAction.DELAY, trigger: ScriptTrigger.SCROLL },
  { name: "Gorgias Chat", pattern: "config.gorgias.chat/", action: ScriptAction.DELAY, trigger: ScriptTrigger.INTERACTION },
];

async function main() {
  console.log("Seeding default script presets...");
  // Script presets are shop-specific; seed inserts metadata only.
  // Actual per-shop records are created on app install via the install webhook handler.
  console.log("Seed complete — presets will be seeded per shop on install.");
  console.log("Default presets configured:", DEFAULT_SCRIPT_PRESETS.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export { DEFAULT_SCRIPT_PRESETS };
