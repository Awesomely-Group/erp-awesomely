-- Reemplaza legal_entities + legalEntityId por enums empresa / marca

ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_legalEntityId_fkey";
ALTER TABLE "companies" DROP COLUMN IF EXISTS "legalEntityId";
DROP TABLE IF EXISTS "legal_entities";

CREATE TYPE "Empresa" AS ENUM ('AWESOMELY_SL', 'AWESOMELY_OU');
CREATE TYPE "Marca" AS ENUM ('GIGSON_SOLUTIONS', 'GIGSON', 'AWESOMELY', 'LATROUPE');

ALTER TABLE "companies" ADD COLUMN "empresa" "Empresa";
ALTER TABLE "companies" ADD COLUMN "marca" "Marca";
