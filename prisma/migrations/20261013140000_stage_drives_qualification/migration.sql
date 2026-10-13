-- La cualificación pasa de ser un booleano suelto en el lead a derivarse de la etapa.
--
-- Había dos verdades para lo mismo: la etapa "Cualificado" del embudo y el checkbox
-- `crm_leads.qualified`, y la comisión por reunión cualificada miraba el checkbox. Un
-- lead arrastrado a "Cualificado" no generaba comisión si nadie marcaba la casilla, y
-- uno en "Nuevo" con la casilla marcada sí la generaba. Mismo criterio que isWon/isLost.

-- AlterTable
ALTER TABLE "crm_stages" ADD COLUMN "isQualified" BOOLEAN NOT NULL DEFAULT false;

-- Marca como cualificadas, en cada funnel, las etapas que van de la de cualificación en
-- adelante, excepto la de perdido: un lead perdido no está cualificado AHORA, que es lo
-- que decide la comisión. Se localiza la etapa de cualificación por nombre porque es como
-- la siembra scripts/seed-growth-crm.ts; los funnels que no tengan una etapa así se
-- quedan todos en false y se marcan a mano.
UPDATE "crm_stages" s
SET "isQualified" = true
FROM (
  SELECT "marca", "lineOfBusiness", MIN("order") AS umbral
  FROM "crm_stages"
  WHERE "name" ILIKE 'cualificad%'
  GROUP BY "marca", "lineOfBusiness"
) u
WHERE s."marca" = u."marca"
  AND s."lineOfBusiness" = u."lineOfBusiness"
  AND s."order" >= u.umbral
  AND s."isLost" = false;

-- AlterTable
-- `crm_leads` está vacía (el CRM se sembró sin leads y la carga del inventario aún no se
-- ha ejecutado), así que no hay nada que migrar a la etapa antes de quitar la columna.
ALTER TABLE "crm_leads" DROP COLUMN "qualified";
