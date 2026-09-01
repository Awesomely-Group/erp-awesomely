-- CreateEnum
CREATE TYPE "payment_direction" AS ENUM ('INCOME', 'EXPENSE');

-- AlterTable
ALTER TABLE "invoice_payments" ADD COLUMN     "accountMappingId" TEXT,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "direction" "payment_direction",
ADD COLUMN     "marca" TEXT,
ALTER COLUMN "invoiceId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "invoice_payments_paidAt_idx" ON "invoice_payments"("paidAt");

-- CreateIndex
CREATE INDEX "invoice_payments_direction_idx" ON "invoice_payments"("direction");

-- CreateIndex
CREATE INDEX "invoice_payments_companyId_idx" ON "invoice_payments"("companyId");

-- CreateIndex
CREATE INDEX "invoice_payments_accountMappingId_idx" ON "invoice_payments"("accountMappingId");

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_accountMappingId_fkey" FOREIGN KEY ("accountMappingId") REFERENCES "account_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
