/**
 * Limpiezas de un solo uso que vivían como rutas `POST /api/fix-*`.
 *
 * Ya corrieron en su día (marzo–mayo de 2026) y no las llamaba nadie, pero un POST que
 * reescribe marcas de facturas o estados no debería ser alcanzable por HTTP: basta una
 * sesión y una URL adivinada. Como script hay que entrar en la máquina y escribir
 * `--apply`, que es la fricción que corresponde.
 *
 *   pnpm tsx scripts/one-time-fixes.ts domains          # dry-run
 *   pnpm tsx scripts/one-time-fixes.ts domains --apply
 *
 * Tareas: `domains`, `invoice-status`, `marca`.
 */
import { prisma } from "../src/lib/prisma";
import { updateInvoiceStatus } from "../src/lib/sync";

const MARCAS_AUTOCLASIFICADAS = ["Awesomely", "Gigson"];

const apply = process.argv.includes("--apply");
const tarea = process.argv[2];

/** Quita `https://` y la barra final de los dominios de workspace de Jira. */
async function domains(): Promise<void> {
  const workspaces = await prisma.jiraWorkspace.findMany();
  for (const workspace of workspaces) {
    const limpio = workspace.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (limpio === workspace.domain) continue;
    console.log(`${workspace.name}: ${workspace.domain} → ${limpio}`);
    if (apply) {
      await prisma.jiraWorkspace.update({ where: { id: workspace.id }, data: { domain: limpio } });
    }
  }
}

/** Recalcula el estado de las facturas de marcas que se clasifican solas. */
async function invoiceStatus(): Promise<void> {
  const facturas = await prisma.invoice.findMany({
    where: { marca: { in: MARCAS_AUTOCLASIFICADAS }, status: { in: ["PENDING", "PARTIAL"] } },
    select: { id: true, number: true, status: true },
  });
  console.log(`${facturas.length} factura(s) a recalcular`);
  if (!apply) return;
  for (const factura of facturas) await updateInvoiceStatus(factura.id);
}

/** Limpia la marca de las facturas que no tienen ninguna línea clasificada. */
async function marca(): Promise<void> {
  const facturas = await prisma.invoice.findMany({
    where: { marca: { not: null }, lines: { none: { classification: { isNot: null } } } },
    select: { id: true, number: true, marca: true },
  });
  console.log(`${facturas.length} factura(s) con marca y sin clasificar`);
  if (!apply) return;
  await prisma.invoice.updateMany({
    where: { id: { in: facturas.map((f) => f.id) } },
    data: { marca: null },
  });
}

const tareas: Record<string, () => Promise<void>> = {
  domains,
  "invoice-status": invoiceStatus,
  marca,
};

async function main(): Promise<void> {
  const fn = tarea ? tareas[tarea] : undefined;
  if (!fn) {
    console.error(`Tareas disponibles: ${Object.keys(tareas).join(", ")}`);
    process.exit(1);
  }
  console.log(apply ? "⚠ APLICANDO cambios" : "Dry-run (añade --apply para escribir)");
  await fn();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
