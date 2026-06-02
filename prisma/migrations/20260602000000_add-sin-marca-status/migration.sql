-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'SIN_MARCA';

-- Reclassify existing PENDING/PARTIAL invoices with no marca to SIN_MARCA
UPDATE "invoices"
SET status = 'SIN_MARCA'
WHERE status IN ('PENDING', 'PARTIAL')
  AND (marca IS NULL OR marca = '');
