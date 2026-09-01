-- AlterTable
ALTER TABLE "invoice_payments" ADD COLUMN     "dueDate" TIMESTAMP(3),
ALTER COLUMN "paidAt" DROP NOT NULL,
ALTER COLUMN "paidBy" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "invoice_payments_dueDate_idx" ON "invoice_payments"("dueDate");
