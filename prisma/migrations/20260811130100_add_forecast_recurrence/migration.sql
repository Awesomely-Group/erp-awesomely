-- CreateEnum
CREATE TYPE "forecast_frequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "forecast_recurrences" (
    "id" TEXT NOT NULL,
    "frequency" "forecast_frequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "occurrences" INTEGER,
    "type" "forecast_type" NOT NULL,
    "marca" TEXT,
    "projectId" TEXT,
    "accountMappingId" TEXT,
    "supplierId" TEXT,
    "description" TEXT,
    "amountOptimistic" DECIMAL(65,30) NOT NULL,
    "amountPessimistic" DECIMAL(65,30) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forecast_recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forecast_recurrences_marca_idx" ON "forecast_recurrences"("marca");

-- AddForeignKey
ALTER TABLE "forecast_recurrences" ADD CONSTRAINT "forecast_recurrences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "jira_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_recurrences" ADD CONSTRAINT "forecast_recurrences_accountMappingId_fkey" FOREIGN KEY ("accountMappingId") REFERENCES "account_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_recurrences" ADD CONSTRAINT "forecast_recurrences_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "forecasts" ADD COLUMN "recurrenceId" TEXT;
ALTER TABLE "forecasts" ADD COLUMN "isPaused" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "forecasts_recurrenceId_idx" ON "forecasts"("recurrenceId");

-- AddForeignKey
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "forecast_recurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
