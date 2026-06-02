-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'SIN_MARCA';

-- Reclassify existing PENDING/PARTIAL invoices with no marca to SIN_MARCA
UPDATE "Invoice"
SET status = 'SIN_MARCA'
WHERE status IN ('PENDING', 'PARTIAL')
  AND (marca IS NULL OR marca = '');
