-- AlterTable
ALTER TABLE "forecasts" ADD COLUMN "accountMappingId" TEXT;
ALTER TABLE "forecasts" ADD COLUMN "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "forecasts_accountMappingId_idx" ON "forecasts"("accountMappingId");

-- CreateIndex
CREATE INDEX "forecasts_supplierId_idx" ON "forecasts"("supplierId");

-- AddForeignKey
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_accountMappingId_fkey" FOREIGN KEY ("accountMappingId") REFERENCES "account_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
