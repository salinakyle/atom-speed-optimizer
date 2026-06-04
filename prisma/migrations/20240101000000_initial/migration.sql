-- CreateEnum
CREATE TYPE "ShopPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "ScoreSource" AS ENUM ('RUM', 'PSI', 'LIGHTHOUSE');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET');

-- CreateEnum
CREATE TYPE "ScriptAction" AS ENUM ('DEFER', 'DELAY', 'BLOCK');

-- CreateEnum
CREATE TYPE "ScriptTrigger" AS ENUM ('INTERACTION', 'SCROLL', 'IDLE', 'TIMER');

-- CreateEnum
CREATE TYPE "LogStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "plan" "ShopPlan" NOT NULL DEFAULT 'FREE',
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "scriptTagId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationSettings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "fullPageCacheEnabled" BOOLEAN NOT NULL DEFAULT true,
    "browserCacheTtl" INTEGER NOT NULL DEFAULT 3600,
    "cacheWarmingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deferJsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "delayThirdPartyJs" BOOLEAN NOT NULL DEFAULT true,
    "delayTrigger" TEXT NOT NULL DEFAULT 'interaction',
    "minifyCssEnabled" BOOLEAN NOT NULL DEFAULT true,
    "criticalCssEnabled" BOOLEAN NOT NULL DEFAULT true,
    "removeUnusedCss" BOOLEAN NOT NULL DEFAULT false,
    "lazyLoadImages" BOOLEAN NOT NULL DEFAULT true,
    "webpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lcpPreloadEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lcpPreloadUrl" TEXT,
    "fontDisplaySwap" BOOLEAN NOT NULL DEFAULT true,
    "preloadFonts" BOOLEAN NOT NULL DEFAULT true,
    "dnsPrefetchEnabled" BOOLEAN NOT NULL DEFAULT true,
    "preconnectEnabled" BOOLEAN NOT NULL DEFAULT true,
    "prefetchOnHover" BOOLEAN NOT NULL DEFAULT true,
    "minifyHtmlEnabled" BOOLEAN NOT NULL DEFAULT false,
    "resourceHints" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptimizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceScore" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" "ScoreSource" NOT NULL DEFAULT 'RUM',
    "lcp" DOUBLE PRECISION,
    "fid" DOUBLE PRECISION,
    "inp" DOUBLE PRECISION,
    "cls" DOUBLE PRECISION,
    "fcp" DOUBLE PRECISION,
    "ttfb" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "device" "DeviceType" NOT NULL DEFAULT 'DESKTOP',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacheEntry" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "ttl" INTEGER NOT NULL DEFAULT 3600,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacheEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptRule" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" "ScriptAction" NOT NULL DEFAULT 'DELAY',
    "trigger" "ScriptTrigger" NOT NULL DEFAULT 'INTERACTION',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScriptRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertThreshold" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "LogStatus" NOT NULL DEFAULT 'PENDING',
    "details" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "OptimizationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");
CREATE INDEX "Shop_domain_idx" ON "Shop"("domain");
CREATE UNIQUE INDEX "OptimizationSettings_shopId_key" ON "OptimizationSettings"("shopId");
CREATE INDEX "PerformanceScore_shopId_url_recordedAt_idx" ON "PerformanceScore"("shopId", "url", "recordedAt");
CREATE INDEX "PerformanceScore_shopId_recordedAt_idx" ON "PerformanceScore"("shopId", "recordedAt");
CREATE UNIQUE INDEX "CacheEntry_shopId_url_key" ON "CacheEntry"("shopId", "url");
CREATE INDEX "CacheEntry_shopId_expiresAt_idx" ON "CacheEntry"("shopId", "expiresAt");
CREATE INDEX "ScriptRule_shopId_idx" ON "ScriptRule"("shopId");
CREATE INDEX "AlertThreshold_shopId_idx" ON "AlertThreshold"("shopId");
CREATE INDEX "OptimizationLog_shopId_startedAt_idx" ON "OptimizationLog"("shopId", "startedAt");

-- AddForeignKey
ALTER TABLE "OptimizationSettings" ADD CONSTRAINT "OptimizationSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceScore" ADD CONSTRAINT "PerformanceScore_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CacheEntry" ADD CONSTRAINT "CacheEntry_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScriptRule" ADD CONSTRAINT "ScriptRule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertThreshold" ADD CONSTRAINT "AlertThreshold_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OptimizationLog" ADD CONSTRAINT "OptimizationLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
