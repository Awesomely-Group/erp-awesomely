-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "sourcePlatform" TEXT,
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "executiveSummary" TEXT,
ADD COLUMN     "paymentConditions" TEXT,
ADD COLUMN     "validUntil" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "documensoDocumentId" INTEGER,
ADD COLUMN     "documensoStatus" TEXT;

-- AlterTable
ALTER TABLE "budget_lines" ADD COLUMN     "rateType" TEXT,
ADD COLUMN     "serviceType" TEXT,
ADD COLUMN     "deliverables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "budgets_sourcePlatform_externalRef_key" ON "budgets"("sourcePlatform", "externalRef");
