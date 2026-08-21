-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "sourceDocumentHoldedId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "sourceDocumentType" TEXT;
ALTER TABLE "invoices" ADD COLUMN "sourceDocumentChecked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "proformas" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "proformas" ADD COLUMN "invoiceLinkedManually" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "proformas" ADD COLUMN "invoiceLinkConfidence" TEXT;

-- CreateIndex
CREATE INDEX "proformas_invoiceId_idx" ON "proformas"("invoiceId");

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
