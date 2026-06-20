/**
 * One-shot backfill: marks invoices in the DB that no longer exist in Holded
 * with removedFromHoldedAt = now(), so they appear as "Eliminada en Holded" in the UI.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/mark-removed-from-holded.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { HoldedClient } from "../src/lib/holded";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const companies = await prisma.company.findMany({ where: { active: true } });
  console.log(`\nBackfill removedFromHoldedAt for ${companies.length} company(ies)...\n`);

  const now = new Date();

  for (const company of companies) {
    console.log(`── ${company.name} ──`);
    const client = new HoldedClient(company.holdedApiKey);

    const [sales, purchases] = await Promise.all([
      client.getAllInvoicesPaginated("invoice"),
      client.getAllInvoicesPaginated("purchase"),
    ]);

    const returnedHoldedIds = new Set([
      ...sales.map((i) => i.id),
      ...purchases.map((i) => i.id),
    ]);
    console.log(`  Holded returned: ${returnedHoldedIds.size} invoices`);

    // Find DB invoices not in Holded that have user work (classifications or ERP payments)
    const result = await prisma.invoice.updateMany({
      where: {
        companyId: company.id,
        holdedId: { notIn: [...returnedHoldedIds] },
        removedFromHoldedAt: null,
        OR: [
          { lines: { some: { classification: { isNot: null } } } },
          { erpPayments: { some: {} } },
        ],
      },
      data: { removedFromHoldedAt: now },
    });

    console.log(`  Marked: ${result.count} invoice(s) as removed from Holded`);

    // Report the specific holdedIds that were marked
    if (result.count > 0) {
      const marked = await prisma.invoice.findMany({
        where: { companyId: company.id, removedFromHoldedAt: now },
        select: { holdedId: true, number: true, counterparty: true, date: true },
      });
      for (const inv of marked) {
        console.log(`    • ${inv.holdedId}  ${inv.number ?? "—"}  ${inv.counterparty ?? "—"}  ${inv.date.toISOString().slice(0, 10)}`);
      }
    }
  }

  await prisma.$disconnect();
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
