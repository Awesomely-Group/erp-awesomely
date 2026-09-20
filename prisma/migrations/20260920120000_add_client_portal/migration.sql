-- Portal de cliente (2026-09-20) — ver docs/portal-cliente-plan.md
--
-- Aditiva y no destructiva: columnas nullable sin default y tablas nuevas. No toca
-- ninguna columna ni fila existente, así que puede aplicarse con la aplicación en marcha.
--
-- Generada con `prisma migrate diff --from-schema <schema en HEAD> --to-schema <nuevo>`
-- en vez de contra la base real: la Neon es compartida y arrastra cambios de otras ramas
-- sin mergear, así que diffear contra ella habría colado DDL ajeno a este cambio (el
-- mismo cuidado que documenta 20260918120000_add_growth_crm_module).

-- AlterTable
ALTER TABLE "jira_projects" ADD COLUMN     "crmAccountId" TEXT;

-- AlterTable
ALTER TABLE "project_user_roles" ADD COLUMN     "giroUserEmail" TEXT;

-- CreateTable
CREATE TABLE "hour_bucket_consumptions" (
    "bucketId" TEXT NOT NULL,
    "consumedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingApprovalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hour_bucket_consumptions_pkey" PRIMARY KEY ("bucketId")
);

-- CreateTable
CREATE TABLE "project_hours_snapshots" (
    "projectId" TEXT NOT NULL,
    "pendingAttributionHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nonBillableHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "worklogFloorDate" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lastError" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_hours_snapshots_pkey" PRIMARY KEY ("projectId")
);

-- CreateIndex
CREATE INDEX "jira_projects_crmAccountId_idx" ON "jira_projects"("crmAccountId");

-- CreateIndex
CREATE INDEX "crm_contacts_email_idx" ON "crm_contacts"("email");

-- AddForeignKey
ALTER TABLE "jira_projects" ADD CONSTRAINT "jira_projects_crmAccountId_fkey" FOREIGN KEY ("crmAccountId") REFERENCES "crm_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_bucket_consumptions" ADD CONSTRAINT "hour_bucket_consumptions_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "hour_buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_hours_snapshots" ADD CONSTRAINT "project_hours_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "jira_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

