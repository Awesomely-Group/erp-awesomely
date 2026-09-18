-- Growth / CRM module (plan revisado 2026-09-18).
--
-- NOTA IMPORTANTE: el diff generado por `prisma migrate diff --from-config-datasource`
-- contra la base de datos real incluía además un DROP de las tablas `google_ads_*` y de
-- las columnas `sync_logs.googleAdsAccountId`/`sync_logs.recordsSynced`, porque esa base
-- de datos ya tiene aplicados cambios de una rama distinta (con toda probabilidad la
-- integración de Campañas en Cursor que el usuario mencionó como pausada) que no están
-- en el `schema.prisma` de esta rama. Esta migración NO incluye esos DROP a propósito —
-- son ajenos a este módulo y borrarían trabajo real de otra rama. Antes de fusionar esa
-- rama de Campañas con esta, habrá que reconciliar a mano el historial de
-- `prisma/migrations` (dos carpetas de migraciones independientes han tocado la misma
-- base de datos compartida).

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'COMERCIAL');

-- CreateEnum
CREATE TYPE "crm_lead_source" AS ENUM ('WEB_GIGSON', 'WEB_LATROUPE', 'APOLLO', 'MANUAL', 'REFERIDO', 'OTRO');

-- CreateEnum
CREATE TYPE "crm_stage_change_trigger" AS ENUM ('MANUAL_DRAG', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "crm_account_lifecycle" AS ENUM ('LEAD', 'QUALIFIED', 'CUSTOMER', 'CHURNED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "crm_activity_type" AS ENUM ('NOTE', 'CALL', 'MEETING', 'TASK');

-- CreateEnum
CREATE TYPE "commission_type" AS ENUM ('PROPOSAL_PERCENT', 'QUALIFIED_MEETING');

-- CreateEnum
CREATE TYPE "commission_status" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "user_role" NOT NULL DEFAULT 'ADMIN';

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "crmLeadId" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "crm_stages" (
    "id" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "source" "crm_lead_source" NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "amount" DECIMAL(65,30),
    "stageId" TEXT NOT NULL,
    "ownerId" TEXT,
    "accountId" TEXT,
    "campaignSource" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "externalRef" TEXT,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "expectedCloseDate" TIMESTAMP(3),
    "probability" INTEGER,
    "notes" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_stage_events" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "trigger" "crm_stage_change_trigger" NOT NULL DEFAULT 'MANUAL_DRAG',
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_lead_stage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "vatNumber" TEXT,
    "lifecycle" "crm_account_lifecycle" NOT NULL DEFAULT 'LEAD',
    "marca" TEXT,
    "ownerId" TEXT,
    "companyId" TEXT,
    "holdedContactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" TEXT NOT NULL,
    "type" "crm_activity_type" NOT NULL,
    "leadId" TEXT,
    "accountId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "marca" TEXT NOT NULL,
    "proposalPercent" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "qualifiedMeetingAmount" DECIMAL(65,30) NOT NULL DEFAULT 20,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("marca")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "type" "commission_type" NOT NULL,
    "marca" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leadId" TEXT,
    "budgetId" TEXT,
    "activityId" TEXT,
    "baseAmount" DECIMAL(65,30),
    "rate" DECIMAL(65,30),
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "commission_status" NOT NULL DEFAULT 'PENDING',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_stages_marca_idx" ON "crm_stages"("marca");

-- CreateIndex
CREATE UNIQUE INDEX "crm_stages_marca_order_key" ON "crm_stages"("marca", "order");

-- CreateIndex
CREATE INDEX "crm_leads_marca_idx" ON "crm_leads"("marca");

-- CreateIndex
CREATE INDEX "crm_leads_stageId_idx" ON "crm_leads"("stageId");

-- CreateIndex
CREATE INDEX "crm_leads_ownerId_idx" ON "crm_leads"("ownerId");

-- CreateIndex
CREATE INDEX "crm_leads_accountId_idx" ON "crm_leads"("accountId");

-- CreateIndex
CREATE INDEX "crm_leads_source_idx" ON "crm_leads"("source");

-- CreateIndex
CREATE UNIQUE INDEX "crm_leads_source_externalRef_key" ON "crm_leads"("source", "externalRef");

-- CreateIndex
CREATE INDEX "crm_lead_stage_events_leadId_idx" ON "crm_lead_stage_events"("leadId");

-- CreateIndex
CREATE INDEX "crm_lead_stage_events_changedAt_idx" ON "crm_lead_stage_events"("changedAt");

-- CreateIndex
CREATE INDEX "crm_accounts_companyId_holdedContactId_idx" ON "crm_accounts"("companyId", "holdedContactId");

-- CreateIndex
CREATE INDEX "crm_accounts_ownerId_idx" ON "crm_accounts"("ownerId");

-- CreateIndex
CREATE INDEX "crm_contacts_accountId_idx" ON "crm_contacts"("accountId");

-- CreateIndex
CREATE INDEX "crm_activities_leadId_idx" ON "crm_activities"("leadId");

-- CreateIndex
CREATE INDEX "crm_activities_accountId_idx" ON "crm_activities"("accountId");

-- CreateIndex
CREATE INDEX "crm_activities_dueDate_idx" ON "crm_activities"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_activityId_key" ON "commissions"("activityId");

-- CreateIndex
CREATE INDEX "commissions_userId_idx" ON "commissions"("userId");

-- CreateIndex
CREATE INDEX "commissions_marca_idx" ON "commissions"("marca");

-- CreateIndex
CREATE INDEX "commissions_status_idx" ON "commissions"("status");

-- CreateIndex
CREATE INDEX "budgets_crmLeadId_idx" ON "budgets"("crmLeadId");

-- CreateIndex
CREATE INDEX "proformas_companyId_holdedContactId_idx" ON "proformas"("companyId", "holdedContactId");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_crmLeadId_fkey" FOREIGN KEY ("crmLeadId") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "crm_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_stage_events" ADD CONSTRAINT "crm_lead_stage_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_stage_events" ADD CONSTRAINT "crm_lead_stage_events_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "crm_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_stage_events" ADD CONSTRAINT "crm_lead_stage_events_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "crm_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_stage_events" ADD CONSTRAINT "crm_lead_stage_events_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "crm_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
