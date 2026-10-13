-- Las cuatro piezas del modelo de CRM acordadas los días 20-21 de septiembre, posteriores
-- al módulo original (#37, del 18): relaciones entre cuentas, papel en la decisión, tipo
-- de operación y cuentas de tipo prescriptor.
--
-- Escrita a mano a propósito, igual que 20260918120000_add_growth_crm_module: un diff
-- contra la base real sigue proponiendo DROP de las tablas `google_ads_*` de la rama de
-- Campañas, que no están en este schema. Incluirlos borraría trabajo ajeno a este cambio.
--
-- Los tres ALTER son aditivos y con DEFAULT, así que no bloquean ni reescriben las filas
-- existentes en Postgres 11+ y la carga de cuentas y contactos ya hecha no se toca.

-- CreateEnum
CREATE TYPE "crm_account_type" AS ENUM ('CLIENT', 'PARTNER');

-- CreateEnum
CREATE TYPE "crm_relation_type" AS ENUM ('HOLDING_OF', 'SUBSIDIARY_OF', 'SIBLING_OF', 'SUPPLIER_OF', 'ADVISOR_OF');

-- CreateEnum
CREATE TYPE "crm_decision_role" AS ENUM ('DECISOR', 'PRESCRIPTOR', 'ASESOR_EXTERNO', 'TECNICO', 'ADMINISTRATIVO', 'USUARIO');

-- CreateEnum
CREATE TYPE "crm_deal_type" AS ENUM ('NEW_BUSINESS', 'EXPANSION', 'RENEWAL');

-- AlterTable
ALTER TABLE "crm_accounts" ADD COLUMN     "type" "crm_account_type" NOT NULL DEFAULT 'CLIENT',
ADD COLUMN     "referredByAccountId" TEXT;

-- AlterTable
ALTER TABLE "crm_leads" ADD COLUMN     "dealType" "crm_deal_type" NOT NULL DEFAULT 'NEW_BUSINESS';

-- CreateTable
CREATE TABLE "crm_account_relations" (
    "id" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "type" "crm_relation_type" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_account_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_contacts" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" "crm_decision_role" NOT NULL DEFAULT 'USUARIO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_lead_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_leads_dealType_idx" ON "crm_leads"("dealType");

-- CreateIndex
CREATE INDEX "crm_accounts_type_idx" ON "crm_accounts"("type");

-- CreateIndex
CREATE INDEX "crm_accounts_referredByAccountId_idx" ON "crm_accounts"("referredByAccountId");

-- CreateIndex
CREATE INDEX "crm_account_relations_fromAccountId_idx" ON "crm_account_relations"("fromAccountId");

-- CreateIndex
CREATE INDEX "crm_account_relations_toAccountId_idx" ON "crm_account_relations"("toAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_account_relations_fromAccountId_toAccountId_type_key" ON "crm_account_relations"("fromAccountId", "toAccountId", "type");

-- CreateIndex
CREATE INDEX "crm_lead_contacts_leadId_idx" ON "crm_lead_contacts"("leadId");

-- CreateIndex
CREATE INDEX "crm_lead_contacts_contactId_idx" ON "crm_lead_contacts"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_lead_contacts_leadId_contactId_key" ON "crm_lead_contacts"("leadId", "contactId");

-- AddForeignKey
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_referredByAccountId_fkey" FOREIGN KEY ("referredByAccountId") REFERENCES "crm_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_account_relations" ADD CONSTRAINT "crm_account_relations_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "crm_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_account_relations" ADD CONSTRAINT "crm_account_relations_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "crm_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_contacts" ADD CONSTRAINT "crm_lead_contacts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_contacts" ADD CONSTRAINT "crm_lead_contacts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
