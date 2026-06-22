/**
 * Importa un documento de Holded directamente por su ID.
 *
 * Útil para documentos en estado draft (sin número de documento) que el API
 * de Holded no devuelve en las consultas paginadas de /purchases o /invoices.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/sync-by-holded-id.ts <holdedId> [purchase|invoice] [companyId]
 *
 * Ejemplos:
 *   npx tsx --env-file=.env.local scripts/sync-by-holded-id.ts 6967fc24ff42013871067a8e purchase
 *   npx tsx --env-file=.env.local scripts/sync-by-holded-id.ts 6967fc24ff42013871067a8e purchase cmnbew1zp000004l6pjz4wp0y
 */
import { syncDocumentById } from "../src/lib/sync";

const AWESOMELY_SL = "cmnbew1zp000004l6pjz4wp0y";

async function main(): Promise<void> {
  const [holdedId, rawType, rawCompany] = process.argv.slice(2);

  if (!holdedId) {
    console.error("Uso: sync-by-holded-id.ts <holdedId> [purchase|invoice] [companyId]");
    process.exit(1);
  }

  const type = (rawType === "invoice" ? "invoice" : "purchase") as "invoice" | "purchase";
  const companyId = rawCompany ?? AWESOMELY_SL;

  console.log(`Importando ${type} ${holdedId} para empresa ${companyId}…`);

  const result = await syncDocumentById(companyId, holdedId, type);

  if (!result.found) {
    console.error(`❌ Documento ${holdedId} no encontrado en Holded (¿ID correcto? ¿empresa correcta?)`);
    process.exit(1);
  }

  console.log(`✅ Importado correctamente. Invoice ID en ERP: ${result.invoiceId}`);
  console.log("   Puedes clasificarlo ahora en el ERP.");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
