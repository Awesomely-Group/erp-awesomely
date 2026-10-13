-- Pone al día el historial de migraciones con la base que ya existe.
--
-- Entre el init (marzo) y `20260515120000_hour_bucket_dates` (mayo) el esquema se cambió
-- con `prisma db push` en vez de con migraciones. El resultado es que 14 de las 29
-- migraciones NO se pueden aplicar sobre una base vacía: alteran tablas que nadie crea.
-- En producción nunca se notó porque `migrate deploy` solo aplica lo pendiente y jamás
-- compara el resultado con el esquema; lo que se rompe es cualquier base nueva —una
-- preview de Neon, el entorno de alguien que entra, una restauración—, y no al crearla,
-- sino la primera vez que alguien toca proformas o proveedores.
--
-- Esta migración crea lo que falta. Va fechada justo después del init porque ahí es donde
-- hace falta: las migraciones de mayo en adelante dan por hecho que estas tablas existen.
--
-- TODO es idempotente (IF NOT EXISTS y comprobaciones contra el catálogo) porque en
-- producción ya está todo creado y aquí se aplicará igualmente: tiene que ser un no-op.
--
-- Las tablas se crean en la forma que tenían ENTONCES, sin las columnas que añaden las
-- migraciones posteriores (`suppliers.isPartner`, `proformas.invoiceId`, las cinco de
-- `forecasts`…): si se crearan ya completas, esas migraciones fallarían al añadirlas.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "budget_line_type" AS ENUM ('ROL', 'ACTIVIDAD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "forecast_type" AS ENUM ('INCOME', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "project_status" AS ENUM ('NOT_STARTED', 'ONGOING', 'PAUSED', 'DONE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "supplier_tipo" AS ENUM ('SERVICIOS', 'HERRAMIENTAS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "verification_status" AS ENUM ('PENDING', 'HOURS_CAPTURED', 'INVOICE_RECEIVED', 'PERIOD_MISMATCH', 'VERIFIED_MISMATCH', 'VERIFIED_OK', 'APPROVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "account_mappings" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "l1" TEXT NOT NULL,
    "accountNumSL" TEXT,
    "accountNameSL" TEXT,
    "accountNumOU" TEXT,
    "accountNameOU" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "forecasts" (
    "id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "type" "forecast_type" NOT NULL,
    "marca" TEXT,
    "projectId" TEXT,
    "description" TEXT,
    "amountOptimistic" DECIMAL(65,30) NOT NULL,
    "amountPessimistic" DECIMAL(65,30) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forecasts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "hour_buckets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "code" TEXT,
    "totalHours" double precision NOT NULL,
    "alertThreshold" double precision DEFAULT 0.8 NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hour_buckets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "invoice_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paidBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "issue_hour_bucket_assignments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "issueKey" TEXT NOT NULL,
    "issueNumericId" INTEGER NOT NULL,
    "hourBucketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_hour_bucket_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "journal_entry_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "holdedEntryId" TEXT NOT NULL,
    "holdedLineIdx" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "accountingMonth" TIMESTAMP(3),
    "description" TEXT,
    "account" TEXT NOT NULL,
    "amountEur" DECIMAL(65,30) NOT NULL,
    "originType" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "proformas" (
    "id" TEXT NOT NULL,
    "holdedId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT,
    "counterparty" TEXT,
    "holdedContactId" TEXT,
    "holdedStatus" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "currency" TEXT DEFAULT 'EUR'::text NOT NULL,
    "fxRateToEur" DECIMAL(65,30) DEFAULT 1 NOT NULL,
    "subtotal" DECIMAL(65,30) DEFAULT 0 NOT NULL,
    "tax" DECIMAL(65,30) DEFAULT 0 NOT NULL,
    "total" DECIMAL(65,30) DEFAULT 0 NOT NULL,
    "totalEur" DECIMAL(65,30) DEFAULT 0 NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "marca" TEXT,
    "projectId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proformas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "project_user_roles" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jiraAccountId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "ratePerHour" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_user_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "regular_fee_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleId" TEXT,
    "label" TEXT NOT NULL,
    "monthlyFee" DECIMAL(65,30) NOT NULL,
    "maxHoursPerMonth" double precision NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regular_fee_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "role_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT DEFAULT 'gray'::text NOT NULL,
    "ratePerHour" DECIMAL(65,30) DEFAULT 0 NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "supplier_jira_users" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT "supplier_jira_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "supplier_roles" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratePerHour" DECIMAL(65,30) NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "supplier_verifications" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "roleId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "tempoHours" double precision,
    "expectedAmount" DECIMAL(65,30),
    "capturedAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "invoicedAmount" DECIMAL(65,30),
    "invoiceServicePeriodStart" TIMESTAMP(3),
    "invoiceServicePeriodEnd" TIMESTAMP(3),
    "periodMismatch" BOOLEAN,
    "status" "verification_status" DEFAULT 'PENDING'::"verification_status" NOT NULL,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "suppliers" (
    "id" TEXT NOT NULL,
    "holdedContactId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "hourlyRate" DECIMAL(65,30),
    "tipo" "supplier_tipo",
    "defaultRoleId" TEXT,
    "active" BOOLEAN DEFAULT true NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- AlterTable: columnas que el init no trae y que ninguna migración añade.
-- Mismo origen que las tablas de arriba: entraron por `db push`.
ALTER TABLE "classifications"
  ADD COLUMN IF NOT EXISTS "marca" TEXT;
ALTER TABLE "invoice_lines"
  ADD COLUMN IF NOT EXISTS "accountingAccount" TEXT,
  ADD COLUMN IF NOT EXISTS "accountingAccountName" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "holdedStatus" INTEGER,
  ADD COLUMN IF NOT EXISTS "holdedContactId" TEXT,
  ADD COLUMN IF NOT EXISTS "marca" TEXT,
  ADD COLUMN IF NOT EXISTS "accountingMonth" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentsTotal" DECIMAL(65,30) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "paymentsPending" DECIMAL(65,30) DEFAULT 0 NOT NULL;
ALTER TABLE "jira_projects"
  ADD COLUMN IF NOT EXISTS "status" "project_status" DEFAULT 'NOT_STARTED'::project_status NOT NULL,
  ADD COLUMN IF NOT EXISTS "isPrecioCerrado" BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "isBolsasHoras" BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "isFeeRegular" BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "fixedPrice" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "budgetedHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "fixedPriceInvoiceId" TEXT;
ALTER TABLE "jira_workspaces"
  ADD COLUMN IF NOT EXISTS "tempoApiToken" TEXT;
ALTER TABLE "sync_logs"
  ADD COLUMN IF NOT EXISTS "triggeredBy" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "account_mappings_tag_key" ON "account_mappings"("tag");
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_keyHash_key" ON "api_keys"("keyHash");
CREATE INDEX IF NOT EXISTS "forecasts_marca_idx" ON "forecasts"("marca");
CREATE INDEX IF NOT EXISTS "forecasts_month_idx" ON "forecasts"("month");
CREATE UNIQUE INDEX IF NOT EXISTS "hour_buckets_code_key" ON "hour_buckets"("code");
CREATE INDEX IF NOT EXISTS "hour_buckets_invoiceId_idx" ON "hour_buckets"("invoiceId");
CREATE INDEX IF NOT EXISTS "hour_buckets_projectId_idx" ON "hour_buckets"("projectId");
CREATE INDEX IF NOT EXISTS "invoice_payments_invoiceId_idx" ON "invoice_payments"("invoiceId");
CREATE INDEX IF NOT EXISTS "issue_hour_bucket_assignments_hourBucketId_idx" ON "issue_hour_bucket_assignments"("hourBucketId");
CREATE INDEX IF NOT EXISTS "issue_hour_bucket_assignments_issueNumericId_idx" ON "issue_hour_bucket_assignments"("issueNumericId");
CREATE INDEX IF NOT EXISTS "issue_hour_bucket_assignments_projectId_idx" ON "issue_hour_bucket_assignments"("projectId");
CREATE UNIQUE INDEX IF NOT EXISTS "issue_hour_bucket_assignments_projectId_issueKey_key" ON "issue_hour_bucket_assignments"("projectId", "issueKey");
CREATE INDEX IF NOT EXISTS "journal_entry_lines_companyId_accountingMonth_idx" ON "journal_entry_lines"("companyId", "accountingMonth");
CREATE INDEX IF NOT EXISTS "journal_entry_lines_companyId_date_idx" ON "journal_entry_lines"("companyId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entry_lines_companyId_holdedEntryId_holdedLineIdx_key" ON "journal_entry_lines"("companyId", "holdedEntryId", "holdedLineIdx");
CREATE INDEX IF NOT EXISTS "proformas_companyId_date_idx" ON "proformas"("companyId", "date");
CREATE INDEX IF NOT EXISTS "proformas_companyId_idx" ON "proformas"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "proformas_holdedId_companyId_key" ON "proformas"("holdedId", "companyId");
CREATE INDEX IF NOT EXISTS "proformas_marca_idx" ON "proformas"("marca");
CREATE INDEX IF NOT EXISTS "project_user_roles_projectId_idx" ON "project_user_roles"("projectId");
CREATE UNIQUE INDEX IF NOT EXISTS "project_user_roles_projectId_jiraAccountId_key" ON "project_user_roles"("projectId", "jiraAccountId");
CREATE INDEX IF NOT EXISTS "regular_fee_entries_invoiceId_idx" ON "regular_fee_entries"("invoiceId");
CREATE INDEX IF NOT EXISTS "regular_fee_entries_projectId_idx" ON "regular_fee_entries"("projectId");
CREATE INDEX IF NOT EXISTS "regular_fee_entries_roleId_idx" ON "regular_fee_entries"("roleId");
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_jira_users_supplierId_accountId_key" ON "supplier_jira_users"("supplierId", "accountId");
CREATE INDEX IF NOT EXISTS "supplier_roles_supplierId_idx" ON "supplier_roles"("supplierId");
CREATE INDEX IF NOT EXISTS "supplier_verifications_invoiceId_idx" ON "supplier_verifications"("invoiceId");
CREATE INDEX IF NOT EXISTS "supplier_verifications_status_idx" ON "supplier_verifications"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_verifications_supplierId_periodStart_periodEnd_key" ON "supplier_verifications"("supplierId", "periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "suppliers_companyId_idx" ON "suppliers"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_holdedContactId_companyId_key" ON "suppliers"("holdedContactId", "companyId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "jira_projects"("id") ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "hour_buckets" ADD CONSTRAINT "hour_buckets_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "hour_buckets" ADD CONSTRAINT "hour_buckets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "jira_projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "hour_buckets" ADD CONSTRAINT "hour_buckets_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role_templates"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "issue_hour_bucket_assignments" ADD CONSTRAINT "issue_hour_bucket_assignments_hourBucketId_fkey" FOREIGN KEY ("hourBucketId") REFERENCES "hour_buckets"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "issue_hour_bucket_assignments" ADD CONSTRAINT "issue_hour_bucket_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "jira_projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "proformas" ADD CONSTRAINT "proformas_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "proformas" ADD CONSTRAINT "proformas_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "jira_projects"("id") ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "project_user_roles" ADD CONSTRAINT "project_user_roles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "jira_projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "project_user_roles" ADD CONSTRAINT "project_user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role_templates"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "regular_fee_entries" ADD CONSTRAINT "regular_fee_entries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "regular_fee_entries" ADD CONSTRAINT "regular_fee_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "jira_projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "regular_fee_entries" ADD CONSTRAINT "regular_fee_entries_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role_templates"("id") ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_jira_users" ADD CONSTRAINT "supplier_jira_users_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_roles" ADD CONSTRAINT "supplier_roles_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_verifications" ADD CONSTRAINT "supplier_verifications_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_verifications" ADD CONSTRAINT "supplier_verifications_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "supplier_roles"("id") ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_verifications" ADD CONSTRAINT "supplier_verifications_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_defaultRoleId_fkey" FOREIGN KEY ("defaultRoleId") REFERENCES "supplier_roles"("id") ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
