-- Segunda mitad de la puesta al día del historial (ver
-- `20260328111905_baseline_tablas_sin_migracion`, que es la primera).
--
-- Aquella arregla que la cadena NO SE PUEDA APLICAR sobre una base vacía. Esta arregla
-- que, una vez aplicada entera, el resultado NO COINCIDA con `schema.prisma`: faltaban
-- una veintena de índices en tablas que el init sí crea, cinco columnas de `budgets`,
-- cuatro de `budget_lines`, y varias columnas que en algún momento se aflojaron a
-- nullable. Todo ello entró en producción por `prisma db push`.
--
-- Va al final de la cadena y no en la primera porque toca tablas (`budgets`,
-- `budget_lines`) que crean migraciones intermedias: en el baseline todavía no existen.
--
-- Idempotente, como la primera: en producción ya está aplicado de facto y esta migración
-- se ejecutará allí igualmente. Tiene que ser un no-op.


-- DropForeignKey
ALTER TABLE "classifications" DROP CONSTRAINT IF EXISTS "classifications_projectId_fkey";

-- AlterTable
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS     "concept" TEXT,
ADD COLUMN IF NOT EXISTS     "lineType" "budget_line_type" NOT NULL DEFAULT 'ROL',
ADD COLUMN IF NOT EXISTS     "quantity" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS     "unitPrice" DECIMAL(65,30),
ALTER COLUMN "phase" DROP NOT NULL,
ALTER COLUMN "task" DROP NOT NULL,
ALTER COLUMN "estimatedHours" DROP NOT NULL,
ALTER COLUMN "pvpPerHour" DROP NOT NULL,
ALTER COLUMN "costPerHour" DROP NOT NULL;

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS     "clientName" TEXT,
ADD COLUMN IF NOT EXISTS     "companyId" TEXT,
ADD COLUMN IF NOT EXISTS     "holdedContactId" TEXT,
ADD COLUMN IF NOT EXISTS     "holdedDocId" TEXT,
ADD COLUMN IF NOT EXISTS     "holdedSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "classifications" ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_invoiceId_idx" ON "audit_logs"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_classificationId_idx" ON "audit_logs"("classificationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "budgets_companyId_idx" ON "budgets"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "classifications_projectId_idx" ON "classifications"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "classifications_status_idx" ON "classifications"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_companyId_idx" ON "invoices"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_companyId_date_idx" ON "invoices"("companyId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_companyId_holdedContactId_idx" ON "invoices"("companyId", "holdedContactId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_date_idx" ON "invoices"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_accountingMonth_idx" ON "invoices"("accountingMonth");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_marca_idx" ON "invoices"("marca");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_status_type_idx" ON "invoices"("status", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jira_projects_workspaceId_idx" ON "jira_projects"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jira_projects_status_idx" ON "jira_projects"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jira_projects_fixedPriceInvoiceId_idx" ON "jira_projects"("fixedPriceInvoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_logs_companyId_idx" ON "sync_logs"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_logs_workspaceId_idx" ON "sync_logs"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_logs_source_startedAt_idx" ON "sync_logs"("source", "startedAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "jira_projects" ADD CONSTRAINT "jira_projects_fixedPriceInvoiceId_fkey" FOREIGN KEY ("fixedPriceInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "classifications" ADD CONSTRAINT "classifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "jira_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "budgets" ADD CONSTRAINT "budgets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DropColumn: `companies.empresa` y `companies.marca` las creó
-- `20260403160000_empresa_marca_enums` y alguien las sacó del esquema poco después sin
-- escribir la migración. Llevan meses muertas: no están en `schema.prisma`, el cliente de
-- Prisma no las conoce y no hay una sola referencia en `src/`. En producción siguen ahí
-- con los datos de abril. Se tiran, con los dos enums que solo ellas usaban.
--
-- Es irreversible. Se hace a conciencia (decisión del 2026-10-13): mientras siguieran,
-- la comprobación de deriva de CI no podría exigir cero, y un aviso permanente acaba
-- siendo un aviso que nadie lee.
ALTER TABLE "companies" DROP COLUMN IF EXISTS "empresa";
ALTER TABLE "companies" DROP COLUMN IF EXISTS "marca";
DROP TYPE IF EXISTS "Empresa";
DROP TYPE IF EXISTS "Marca";
