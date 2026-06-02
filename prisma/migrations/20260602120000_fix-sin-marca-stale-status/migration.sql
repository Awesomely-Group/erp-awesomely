-- Fix invoices incorrectly marked as SIN_MARCA that actually have a marca set.
-- This happened because updateInvoiceStatus() was called before deriveMarcaFromLines(),
-- so status was computed with the old (null) marca value.

-- Gigson and Awesomely are auto-classified → always CLASSIFIED
UPDATE "invoices"
SET status = 'CLASSIFIED'
WHERE status = 'SIN_MARCA'
  AND marca IS NOT NULL
  AND marca != ''
  AND (
    marca = 'Gigson'
    OR marca = 'Awesomely'
    OR marca = 'Gigson,Awesomely'
    OR marca = 'Awesomely,Gigson'
  );

-- Other marcas with no marca that slipped through → back to PENDING
UPDATE "invoices"
SET status = 'PENDING'
WHERE status = 'SIN_MARCA'
  AND marca IS NOT NULL
  AND marca != '';
