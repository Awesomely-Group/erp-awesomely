-- AlterTable
ALTER TABLE "forecasts" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "forecast_recurrences" ADD COLUMN     "companyId" TEXT;

-- CreateIndex
CREATE INDEX "forecasts_companyId_idx" ON "forecasts"("companyId");

-- CreateIndex
CREATE INDEX "forecast_recurrences_companyId_idx" ON "forecast_recurrences"("companyId");

-- AddForeignKey
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_recurrences" ADD CONSTRAINT "forecast_recurrences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
