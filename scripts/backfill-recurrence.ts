import { PrismaClient, InvoiceType } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { inferInvoiceRecurrence } from "../src/lib/invoice-recurrence";

async function main(): Promise<void> {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const invoices = await prisma.invoice.findMany({
    where: { type: InvoiceType.PURCHASE, recurrence: null, removedFromHoldedAt: null },
    select: {
      id: true,
      type: true,
      companyId: true,
      holdedContactId: true,
      counterparty: true,
      date: true,
      totalEur: true,
      lines: { select: { name: true }, orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });

  console.log(`Facturas PURCHASE sin recurrencia: ${invoices.length}`);

  let updated = 0;
  for (const inv of invoices) {
    const inferred = await inferInvoiceRecurrence(prisma, inv);
    if (inferred !== null) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { recurrence: inferred } });
      updated++;
    }
  }

  console.log(`Backfill completo: ${updated} / ${invoices.length} facturas clasificadas`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
