-- CreateEnum
CREATE TYPE "InvoiceRecurrence" AS ENUM ('PUNTUAL', 'MENSUAL', 'ANUAL', 'EXTRAORDINARIO');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "recurrence" "InvoiceRecurrence";
