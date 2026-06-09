-- Migrate REVIEWED/APPROVED → CLASSIFIED in classifications and invoices
UPDATE "classifications"
SET status = 'CLASSIFIED'
WHERE status IN ('REVIEWED', 'APPROVED');

UPDATE "invoices"
SET status = 'CLASSIFIED'
WHERE status IN ('REVIEWED', 'APPROVED');

-- Recreate InvoiceStatus without REVIEWED and APPROVED
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PARTIAL', 'CLASSIFIED', 'SIN_MARCA');
ALTER TABLE "invoices" ALTER COLUMN status TYPE "InvoiceStatus" USING status::text::"InvoiceStatus";
DROP TYPE "InvoiceStatus_old";

-- Recreate ClassificationStatus without REVIEWED and APPROVED
ALTER TYPE "ClassificationStatus" RENAME TO "ClassificationStatus_old";
CREATE TYPE "ClassificationStatus" AS ENUM ('CLASSIFIED', 'IGNORED');
ALTER TABLE "classifications" ALTER COLUMN status TYPE "ClassificationStatus" USING status::text::"ClassificationStatus";
DROP TYPE "ClassificationStatus_old";
