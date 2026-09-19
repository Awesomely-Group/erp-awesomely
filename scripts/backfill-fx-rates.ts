/**
 * Recalcula `fxRateToEur` y `totalEur` de los documentos en divisa que se sincronizaron
 * bajo el criterio antiguo de "contabilizar 1:1 siempre".
 *
 * Solo toca documentos con `currency != 'EUR'` y `fxRateToEur = 1`: si el tipo guardado
 * no es 1, el documento entró por la rama de `currencyChange` (endpoint de detalle de
 * Holded), donde el importe ya venía en EUR y el cálculo es correcto.
 *
 * Usa el mismo `resolveFxRateToEur` que el sync, así que un resync posterior no deshace
 * lo que haga este script: las divisas dentro de la banda de paridad (GBP, USD) se
 * quedan igual y solo cambian las que están lejos (p. ej. PHP).
 *
 * Uso:
 *   npx tsx scripts/backfill-fx-rates.ts            # dry-run, no escribe
 *   npx tsx scripts/backfill-fx-rates.ts --apply    # aplica los cambios
 *
 * Si el .env no está en el directorio de trabajo (p. ej. desde un worktree):
 *   DOTENV_CONFIG_PATH=/ruta/al/.env npx tsx scripts/backfill-fx-rates.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { resolveFxRateToEur } from "../src/lib/exchange-rates";

const APPLY = process.argv.includes("--apply");

type Change = {
  kind: "factura" | "proforma";
  date: Date;
  number: string | null;
  counterparty: string | null;
  currency: string;
  rate: number;
  oldTotalEur: number;
  newTotalEur: number;
};

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function backfillInvoices(): Promise<Change[]> {
  const invoices = await prisma.invoice.findMany({
    where: { currency: { not: "EUR" }, fxRateToEur: 1 },
    select: {
      id: true,
      date: true,
      number: true,
      counterparty: true,
      currency: true,
      total: true,
      totalEur: true,
      lines: { select: { id: true, total: true } },
    },
    orderBy: { date: "asc" },
  });

  const changes: Change[] = [];

  for (const inv of invoices) {
    const { fxRateToEur: rate } = await resolveFxRateToEur(inv.currency, inv.date);
    if (rate === 1) continue;

    const newTotalEur = Number(inv.total) * rate;

    changes.push({
      kind: "factura",
      date: inv.date,
      number: inv.number,
      counterparty: inv.counterparty,
      currency: inv.currency,
      rate,
      oldTotalEur: Number(inv.totalEur),
      newTotalEur,
    });

    if (!APPLY) continue;

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: inv.id },
        data: { fxRateToEur: rate, totalEur: newTotalEur },
      }),
      ...inv.lines.map((l) =>
        prisma.invoiceLine.update({
          where: { id: l.id },
          data: { totalEur: Number(l.total) * rate },
        })
      ),
    ]);
  }

  return changes;
}

async function backfillProformas(): Promise<Change[]> {
  const proformas = await prisma.proforma.findMany({
    where: { currency: { not: "EUR" }, fxRateToEur: 1 },
    select: {
      id: true,
      date: true,
      number: true,
      counterparty: true,
      currency: true,
      total: true,
      totalEur: true,
    },
    orderBy: { date: "asc" },
  });

  const changes: Change[] = [];

  for (const pf of proformas) {
    const { fxRateToEur: rate } = await resolveFxRateToEur(pf.currency, pf.date);
    if (rate === 1) continue;

    const newTotalEur = Number(pf.total) * rate;

    changes.push({
      kind: "proforma",
      date: pf.date,
      number: pf.number,
      counterparty: pf.counterparty,
      currency: pf.currency,
      rate,
      oldTotalEur: Number(pf.totalEur),
      newTotalEur,
    });

    if (!APPLY) continue;

    await prisma.proforma.update({
      where: { id: pf.id },
      data: { fxRateToEur: rate, totalEur: newTotalEur },
    });
  }

  return changes;
}

async function main(): Promise<void> {
  console.log(APPLY ? "Modo: APLICAR cambios\n" : "Modo: dry-run (usa --apply para escribir)\n");

  const changes = [...(await backfillInvoices()), ...(await backfillProformas())];

  if (changes.length === 0) {
    console.log("No hay documentos que corregir.");
    return;
  }

  for (const c of changes) {
    console.log(
      `${c.date.toISOString().slice(0, 10)} | ${c.kind.padEnd(8)} | ${(c.number ?? "-").padEnd(16)} | ` +
        `${c.currency} @ ${c.rate} | ${fmt(c.oldTotalEur).padStart(14)} € → ${fmt(c.newTotalEur).padStart(12)} € | ` +
        `${c.counterparty ?? "-"}`
    );
  }

  const oldSum = changes.reduce((a, c) => a + c.oldTotalEur, 0);
  const newSum = changes.reduce((a, c) => a + c.newTotalEur, 0);

  console.log(`\nDocumentos corregidos: ${changes.length}`);
  console.log(`Total antes : ${fmt(oldSum)} €`);
  console.log(`Total después: ${fmt(newSum)} €`);
  console.log(`Diferencia  : ${fmt(newSum - oldSum)} €`);

  if (!APPLY) console.log("\nNada escrito. Repite con --apply para aplicarlo.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
