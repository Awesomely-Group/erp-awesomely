-- Separa el lead del deal (decisión del 2026-10-13).
--
-- Hasta ahora `crm_leads` era una sola entidad que recorría el embudo entero. Pasa a
-- haber dos: el LEAD es la entrada comercial sin cualificar —puede no tener cuenta,
-- porque llega gente de la que no consta ni la razón social— y el DEAL es la oportunidad
-- cualificada, que siempre cuelga de una cuenta y lleva etapa, importe y tipo. Una cuenta
-- puede tener varios deals abiertos a la vez: el retainer de Moda re- tiene siete frentes.
--
-- `crm_leads` está vacía (la carga del inventario aún no se ha ejecutado), así que no hay
-- filas que repartir entre las dos tablas.
--
-- `crm_lead_stage_events` y `crm_lead_contacts` se recrean en vez de renombrarse: ambas
-- se crearon en esta misma rama, están vacías, y renombrarlas dejaría sus claves foráneas
-- apuntando a `crm_leads` y sus índices con el nombre viejo.

-- CreateEnum
CREATE TYPE "crm_lead_status" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED');

-- DropTable
DROP TABLE "crm_lead_stage_events";
DROP TABLE "crm_lead_contacts";

-- CreateTable
CREATE TABLE "crm_deals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "lineOfBusiness" TEXT NOT NULL DEFAULT 'GENERAL',
    "accountId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "amount" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "dealType" "crm_deal_type" NOT NULL DEFAULT 'NEW_BUSINESS',
    "seats" INTEGER,
    "origin" "crm_lead_origin",
    "market" TEXT,
    "probability" INTEGER,
    "expectedCloseDate" TIMESTAMP(3),
    "notes" TEXT,
    "ownerId" TEXT,
    "sourceLeadId" TEXT,
    "projectId" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_deals_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "crm_deal_stage_events" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "trigger" "crm_stage_change_trigger" NOT NULL DEFAULT 'MANUAL_DRAG',
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_deal_stage_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "crm_deal_contacts" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" "crm_decision_role" NOT NULL DEFAULT 'USUARIO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_deal_contacts_pkey" PRIMARY KEY ("id")
);

-- AlterTable: el lead pierde todo lo que ahora vive en el deal
ALTER TABLE "crm_leads"
  DROP COLUMN "dealType",
  DROP COLUMN "stageId",
  DROP COLUMN "expectedCloseDate",
  DROP COLUMN "probability",
  DROP COLUMN "projectId",
  ADD COLUMN "status" "crm_lead_status" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "disqualifiedReason" TEXT,
  ADD COLUMN "convertedAt" TIMESTAMP(3);

-- `amount` y `seats` se quedan en el lead como lo DECLARADO en el formulario, que es
-- distinto del importe que el comercial confirma en el deal.
ALTER TABLE "crm_leads" RENAME COLUMN "amount" TO "estimatedAmount";

DROP INDEX IF EXISTS "crm_leads_stageId_idx";
DROP INDEX IF EXISTS "crm_leads_dealType_idx";

-- AlterTable: una actividad puede colgar del lead o del deal
ALTER TABLE "crm_activities" ADD COLUMN "dealId" TEXT;

-- AlterTable: la propuesta es de un deal. Se recrea la clave foránea porque el destino
-- cambia de `crm_leads` a `crm_deals`.
ALTER TABLE "budgets" DROP CONSTRAINT IF EXISTS "budgets_crmLeadId_fkey";
DROP INDEX IF EXISTS "budgets_crmLeadId_idx";
ALTER TABLE "budgets" RENAME COLUMN "crmLeadId" TO "crmDealId";

-- AlterTable: QUALIFIED_MEETING es del lead; PROPOSAL_PERCENT, del deal
ALTER TABLE "commissions" ADD COLUMN "dealId" TEXT;

-- CreateIndex
CREATE INDEX "crm_leads_status_idx" ON "crm_leads"("status");
CREATE INDEX "crm_activities_dealId_idx" ON "crm_activities"("dealId");
CREATE INDEX "commissions_dealId_idx" ON "commissions"("dealId");
CREATE INDEX "budgets_crmDealId_idx" ON "budgets"("crmDealId");
CREATE UNIQUE INDEX "crm_deals_externalRef_key" ON "crm_deals"("externalRef");
CREATE INDEX "crm_deals_marca_idx" ON "crm_deals"("marca");
CREATE INDEX "crm_deals_stageId_idx" ON "crm_deals"("stageId");
CREATE INDEX "crm_deals_ownerId_idx" ON "crm_deals"("ownerId");
CREATE INDEX "crm_deals_accountId_idx" ON "crm_deals"("accountId");
CREATE INDEX "crm_deals_dealType_idx" ON "crm_deals"("dealType");
CREATE INDEX "crm_deals_sourceLeadId_idx" ON "crm_deals"("sourceLeadId");
CREATE INDEX "crm_deal_stage_events_dealId_idx" ON "crm_deal_stage_events"("dealId");
CREATE INDEX "crm_deal_stage_events_changedAt_idx" ON "crm_deal_stage_events"("changedAt");
CREATE INDEX "crm_deal_contacts_dealId_idx" ON "crm_deal_contacts"("dealId");
CREATE INDEX "crm_deal_contacts_contactId_idx" ON "crm_deal_contacts"("contactId");
CREATE UNIQUE INDEX "crm_deal_contacts_dealId_contactId_key" ON "crm_deal_contacts"("dealId", "contactId");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_crmDealId_fkey" FOREIGN KEY ("crmDealId") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "crm_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_sourceLeadId_fkey" FOREIGN KEY ("sourceLeadId") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_deal_stage_events" ADD CONSTRAINT "crm_deal_stage_events_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_deal_stage_events" ADD CONSTRAINT "crm_deal_stage_events_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "crm_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_deal_stage_events" ADD CONSTRAINT "crm_deal_stage_events_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "crm_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_deal_stage_events" ADD CONSTRAINT "crm_deal_stage_events_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_deal_contacts" ADD CONSTRAINT "crm_deal_contacts_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_deal_contacts" ADD CONSTRAINT "crm_deal_contacts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
