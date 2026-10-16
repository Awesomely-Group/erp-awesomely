-- Campañas de pago (Growth > Campañas, revisión 2026-10-16).
--
-- Dos cosas en una, a propósito:
--
-- 1. LIMPIEZA. La rama `marketing-google-ads-wip` (commit c103ab0, 2026-09-08) aplicó en
--    producción dos migraciones que nunca llegaron a main
--    (`20260908120000_add_google_ads_marketing`,
--    `20260908170000_add_google_ads_keywords_search_terms`): cinco tablas `google_ads_*`,
--    dos columnas en `sync_logs` y el valor GOOGLE_ADS en `SyncSource`. Verificado el
--    2026-10-16: las cinco tablas tienen 0 filas y nadie las escribe (la integración por
--    API quedó pausada por falta de developer token). Se borran aquí, todo con IF EXISTS,
--    porque en el Postgres vacío de CI y en cualquier entorno nuevo no existen.
--
-- 2. ALTA del modelo nuevo: `ads_accounts`, `ad_campaigns`, `ad_campaign_daily_stats`,
--    `ad_keyword_stats`, `ad_search_term_stats`, `ads_imports`, y la atribución del lead
--    (`crm_leads.adCampaignId`, gclid, utmTerm/utmContent, formId, landingPage). Los
--    datos entran por POST /api/webhooks/ads-metrics desde un Google Ads Script
--    (scripts/google-ads/push-metrics.js), no por API.

-- CreateEnum
CREATE TYPE "ads_platform" AS ENUM ('GOOGLE_ADS');

-- CreateEnum
CREATE TYPE "ad_campaign_status" AS ENUM ('ENABLED', 'PAUSED', 'REMOVED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ads_import_kind" AS ENUM ('CAMPAIGNS', 'KEYWORDS', 'SEARCH_TERMS');

-- CreateEnum
CREATE TYPE "ads_import_result" AS ENUM ('SUCCESS', 'ERROR');

-- AlterEnum
BEGIN;
CREATE TYPE "SyncSource_new" AS ENUM ('HOLDED', 'JIRA');
ALTER TABLE "sync_logs" ALTER COLUMN "source" TYPE "SyncSource_new" USING ("source"::text::"SyncSource_new");
ALTER TYPE "SyncSource" RENAME TO "SyncSource_old";
ALTER TYPE "SyncSource_new" RENAME TO "SyncSource";
DROP TYPE "public"."SyncSource_old";
COMMIT;

-- DropForeignKey
ALTER TABLE IF EXISTS "google_ads_accounts" DROP CONSTRAINT IF EXISTS "google_ads_accounts_companyId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "google_ads_campaign_daily" DROP CONSTRAINT IF EXISTS "google_ads_campaign_daily_campaignId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "google_ads_campaigns" DROP CONSTRAINT IF EXISTS "google_ads_campaigns_accountId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "google_ads_keyword_daily" DROP CONSTRAINT IF EXISTS "google_ads_keyword_daily_campaignId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "google_ads_search_term_daily" DROP CONSTRAINT IF EXISTS "google_ads_search_term_daily_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "sync_logs" DROP CONSTRAINT IF EXISTS "sync_logs_googleAdsAccountId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "sync_logs_googleAdsAccountId_idx";

-- AlterTable
ALTER TABLE "crm_leads" ADD COLUMN     "adCampaignId" TEXT,
ADD COLUMN     "formId" TEXT,
ADD COLUMN     "gclid" TEXT,
ADD COLUMN     "landingPage" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmTerm" TEXT;

-- AlterTable
ALTER TABLE "sync_logs" DROP COLUMN IF EXISTS "googleAdsAccountId",
DROP COLUMN IF EXISTS "recordsSynced";

-- DropTable
DROP TABLE IF EXISTS "google_ads_accounts";

-- DropTable
DROP TABLE IF EXISTS "google_ads_campaign_daily";

-- DropTable
DROP TABLE IF EXISTS "google_ads_campaigns";

-- DropTable
DROP TABLE IF EXISTS "google_ads_keyword_daily";

-- DropTable
DROP TABLE IF EXISTS "google_ads_search_term_daily";

-- CreateTable
CREATE TABLE "ads_accounts" (
    "id" TEXT NOT NULL,
    "platform" "ads_platform" NOT NULL DEFAULT 'GOOGLE_ADS',
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "marca" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ads_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ad_campaign_status" NOT NULL DEFAULT 'UNKNOWN',
    "dailyBudget" DECIMAL(65,30),
    "marca" TEXT,
    "lineOfBusiness" TEXT,
    "formIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "utmCampaign" TEXT,
    "landingPath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaign_daily_stats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "costEur" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "conversions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "conversionValueEur" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "dailyBudgetEur" DECIMAL(65,30),
    "searchImprShare" DECIMAL(65,30),
    "lostIsBudget" DECIMAL(65,30),
    "lostIsRank" DECIMAL(65,30),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_campaign_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_keyword_stats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "adGroupName" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "keywordText" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "costEur" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "conversions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "qualityScore" INTEGER,

    CONSTRAINT "ad_keyword_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_search_term_stats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "adGroupName" TEXT NOT NULL,
    "searchTerm" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "status" TEXT,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "costEur" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "conversions" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "ad_search_term_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads_imports" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "ads_import_kind" NOT NULL,
    "result" "ads_import_result" NOT NULL,
    "runId" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "rowsReceived" INTEGER NOT NULL,
    "rowsUpserted" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "scriptVersion" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ads_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ads_accounts_platform_externalId_key" ON "ads_accounts"("platform", "externalId");

-- CreateIndex
CREATE INDEX "ad_campaigns_marca_lineOfBusiness_idx" ON "ad_campaigns"("marca", "lineOfBusiness");

-- CreateIndex
CREATE UNIQUE INDEX "ad_campaigns_accountId_externalId_key" ON "ad_campaigns"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "ad_campaign_daily_stats_date_idx" ON "ad_campaign_daily_stats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_campaign_daily_stats_campaignId_date_key" ON "ad_campaign_daily_stats"("campaignId", "date");

-- CreateIndex
CREATE INDEX "ad_keyword_stats_campaignId_date_idx" ON "ad_keyword_stats"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_keyword_stats_campaignId_adGroupId_criterionId_date_key" ON "ad_keyword_stats"("campaignId", "adGroupId", "criterionId", "date");

-- CreateIndex
CREATE INDEX "ad_search_term_stats_campaignId_date_idx" ON "ad_search_term_stats"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_search_term_stats_campaignId_adGroupId_searchTerm_matchT_key" ON "ad_search_term_stats"("campaignId", "adGroupId", "searchTerm", "matchType", "date");

-- CreateIndex
CREATE INDEX "ads_imports_accountId_kind_receivedAt_idx" ON "ads_imports"("accountId", "kind", "receivedAt");

-- CreateIndex
CREATE INDEX "crm_leads_adCampaignId_idx" ON "crm_leads"("adCampaignId");

-- CreateIndex
CREATE INDEX "crm_leads_gclid_idx" ON "crm_leads"("gclid");

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "ad_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ads_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaign_daily_stats" ADD CONSTRAINT "ad_campaign_daily_stats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_keyword_stats" ADD CONSTRAINT "ad_keyword_stats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_search_term_stats" ADD CONSTRAINT "ad_search_term_stats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_imports" ADD CONSTRAINT "ads_imports_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ads_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

