-- Growth: origen/mercado/seats en CrmLead, dimensión lineOfBusiness en CrmStage/CrmLead,
-- y KpiTarget (revisión 2026-09-18, impacto del plan de activación de Odoo).
--
-- Igual que en 20260918120000_add_growth_crm_module: el diff contra la BD real volvía a
-- incluir el DROP de las tablas `google_ads_*` y columnas de `sync_logs` ajenas a esta
-- rama — se excluyen a propósito, no son parte de este cambio.

-- CreateEnum
CREATE TYPE "crm_lead_origin" AS ENUM ('INSIDE_OUT', 'OUTSIDE_IN', 'REFERRAL', 'INBOUND', 'PARTNER');

-- CreateEnum
CREATE TYPE "kpi_target_period_type" AS ENUM ('MONTH', 'QUARTER', 'YEAR');

-- DropIndex (se sustituyen por la versión compuesta con lineOfBusiness, más abajo)
DROP INDEX "crm_stages_marca_idx";

-- DropIndex
DROP INDEX "crm_stages_marca_order_key";

-- AlterTable
ALTER TABLE "crm_leads" ADD COLUMN     "lineOfBusiness" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "market" TEXT,
ADD COLUMN     "origin" "crm_lead_origin",
ADD COLUMN     "seats" INTEGER;

-- AlterTable
ALTER TABLE "crm_stages" ADD COLUMN     "lineOfBusiness" TEXT NOT NULL DEFAULT 'GENERAL';

-- CreateTable
CREATE TABLE "kpi_targets" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "marca" TEXT,
    "lineOfBusiness" TEXT,
    "periodType" "kpi_target_period_type" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kpi_targets_metric_idx" ON "kpi_targets"("metric");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_targets_metric_marca_lineOfBusiness_periodType_periodKe_key" ON "kpi_targets"("metric", "marca", "lineOfBusiness", "periodType", "periodKey");

-- CreateIndex
CREATE INDEX "crm_stages_marca_lineOfBusiness_idx" ON "crm_stages"("marca", "lineOfBusiness");

-- CreateIndex
CREATE UNIQUE INDEX "crm_stages_marca_lineOfBusiness_order_key" ON "crm_stages"("marca", "lineOfBusiness", "order");
