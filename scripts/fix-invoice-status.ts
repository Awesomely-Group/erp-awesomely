// Uso: pnpm tsx scripts/fix-invoice-status.ts
// Corrige el status de facturas con marca Awesomely/Gigson que quedaron en PENDING/PARTIAL
// sin clasificaciones de línea.

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { updateInvoiceStatus } from "../src/lib/sync";
import { InvoiceStatus } from "@prisma/client";

const AUTO_MARCAS = ["Awesomely", "Gigson"];

async function main(): Promise<void> {
  // Facturas en PENDING/PARTIAL con marca auto-clasificable y sin clasificaciones en líneas
  const candidates = await prisma.invoice.findMany({
    where: {
      status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
      OR: AUTO_MARCAS.map((m) => ({
        OR: [
          { marca: m },
          { marca: { startsWith: `${m},` } },
          { marca: { contains: `,${m},` } },
          { marca: { endsWith: `,${m}` } },
        ],
      })),
    },
    select: {
      id: true,
      number: true,
      marca: true,
      status: true,
      lines: {
        select: { classification: { select: { id: true } } },
      },
    },
  });

  // Filtrar: solo las que realmente tienen marca 100% auto-clasificable
  const toFix = candidates.filter((inv) => {
    const marcaValues = (inv.marca ?? "").split(",").filter(Boolean);
    return marcaValues.length > 0 && marcaValues.every((m) => AUTO_MARCAS.includes(m));
  });

  console.log(`Facturas candidatas con marca auto-clasificable en PENDING/PARTIAL: ${candidates.length}`);
  console.log(`A corregir (marca 100% Awesomely/Gigson):                           ${toFix.length}`);

  if (toFix.length === 0) {
    console.log("Nada que corregir.");
    return;
  }

  let fixed = 0;
  for (const inv of toFix) {
    await updateInvoiceStatus(inv.id);
    console.log(`  ✓ ${inv.number ?? inv.id} [${inv.marca}] ${inv.status} → CLASSIFIED`);
    fixed++;
  }

  console.log(`\nCorregidas: ${fixed} facturas.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
